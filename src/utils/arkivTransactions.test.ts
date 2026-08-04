import { describe, expect, it, vi } from "bun:test"
import { decodeAbiParameters, parseAbiParameters, toHex } from "viem"
import {
  type AttributeInputs,
  ConflictingMutationError,
  dec,
  InvalidAttributeNameError,
  InvalidValueError,
  i32,
  MissingValueError,
  u256,
} from "../attr"
import type { ArkivClient } from "../clients/baseClient"
import { InvalidExpiryError } from "../entity"
import { OperationType, DEFAULT_PROTOCOL_PARAMS as PARAMS } from "../entity/params"
import { EmptyPatchError, EntityMutationError } from "../errors"
import { sendArkivTransaction } from "./arkivTransactions"
import { ExpirationTime } from "./expirationTime"

const ENTITY_KEY = `0x${"ab".repeat(32)}` as const
const CURRENT_BLOCK = 100n
const OWNER_NONCE = 7n

const CREATE_PARAMS = parseAbiParameters(
  "(uint128 salt, uint256 expiresAt, uint256 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)",
)

const EXTEND_PARAMS = parseAbiParameters(
  "(bytes32 entityKey, uint256 expiresAt, uint256 minLifetime)",
)

const PATCH_PARAMS = parseAbiParameters(
  "(bytes32 entityKey, (bytes32 name, uint8 typeId, bytes value)[] mutations)",
)

function makeClient() {
  const writeContract = vi.fn().mockResolvedValue("0xdeadbeef")
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({
    status: "success",
    transactionHash: "0xdeadbeef",
  })
  return {
    client: {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: 1 },
      getBlockNumber: vi.fn().mockResolvedValue(CURRENT_BLOCK),
      readContract: vi.fn().mockResolvedValue(OWNER_NONCE),
      writeContract,
      waitForTransactionReceipt,
    } as unknown as ArkivClient,
    writeContract,
  }
}

/** The operations a call put on the wire. */
function sentOperations(writeContract: ReturnType<typeof vi.fn>) {
  return writeContract.mock.calls[0][0].args[0] as {
    operation: number
    operationData: `0x${string}`
  }[]
}

/** The decoded Create struct of the first operation. */
function sentCreate(writeContract: ReturnType<typeof vi.fn>) {
  const [op] = sentOperations(writeContract)
  expect(op.operation).toBe(OperationType.Create)
  return decodeAbiParameters(CREATE_PARAMS, op.operationData)[0]
}

/** The decoded ExtendExpiry struct of the batch's only extension. */
function sentExtension(writeContract: ReturnType<typeof vi.fn>) {
  const op = sentOperations(writeContract).find((o) => o.operation === OperationType.ExtendExpiry)
  if (!op) throw new Error("no ExtendExpiry operation was sent")
  return decodeAbiParameters(EXTEND_PARAMS, op.operationData)[0]
}

const CONTENTS = {
  payload: new Uint8Array([1, 2, 3]),
  contentType: "application/octet-stream",
}

const DAY = ExpirationTime.fromDays(1) // 86400s -> 43200 blocks at 2s
const validCreate = { ...CONTENTS, expires: DAY }

describe("create expiry", () => {
  it("sends a create for a valid expiry", async () => {
    const { client, writeContract } = makeClient()
    const result = await sendArkivTransaction(client, { creates: [validCreate] })
    expect(writeContract).toHaveBeenCalledTimes(1)
    expect(result.receipt.status).toBe("success")
  })

  it("puts the expiry pair on the wire untouched, for the engine to resolve", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [
        {
          ...CONTENTS,
          expires: ExpirationTime.atBlock(5_000n, { atLeast: ExpirationTime.fromSeconds(200) }),
        },
      ],
    })
    const create = sentCreate(writeContract)
    expect(create.expiresAt).toBe(5_000n)
    expect(create.minLifetime).toBe(100n) // 200s at 2s/block
  })

  it("reports the block the entity will actually expire at", async () => {
    const { client } = makeClient()
    const relative = await sendArkivTransaction(client, {
      creates: [{ ...CONTENTS, expires: DAY }],
    })
    expect(relative.createdExpiries[0]).toBe(CURRENT_BLOCK + 43_200n)

    const { client: client2 } = makeClient()
    const absolute = await sendArkivTransaction(client2, {
      creates: [{ ...CONTENTS, expires: ExpirationTime.atBlock(5_000n) }],
    })
    expect(absolute.createdExpiries[0]).toBe(5_000n)

    const { client: client3 } = makeClient()
    const dated = await sendArkivTransaction(client3, {
      creates: [{ ...CONTENTS, expires: ExpirationTime.atDate(new Date(Date.now() + 3600_000)) }],
    })
    // An hour at 2s/block, counted from the block the transaction was built on.
    expect(dated.createdExpiries[0]).toBe(CURRENT_BLOCK + 1800n)
  })

  it("refuses a create with no expiry at all", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...CONTENTS } as never] }),
    ).rejects.toThrow(InvalidExpiryError)
  })

  it("catches a dead-on-arrival expiry before it costs gas", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [{ ...CONTENTS, expires: ExpirationTime.atBlock(CURRENT_BLOCK - 1n) }],
      }),
    ).rejects.toThrow(/dead on arrival/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects a malformed duration at the call site, long before the transaction", () => {
    // 999 seconds is 499.5 blocks, which is not a lifetime the chain can store. Building the value
    // throws, so nothing malformed ever reaches sendArkivTransaction.
    expect(() => ExpirationTime.fromSeconds(999)).toThrow(/multiple of the 2s block time/)
    expect(() => ExpirationTime.fromSeconds(0)).toThrow(InvalidExpiryError)
    expect(() => ExpirationTime.fromSeconds(1.5)).toThrow(/positive whole number of seconds/)
  })
})

describe("extend expiry", () => {
  it("resolves an extension exactly like a create, both forms", async () => {
    const { client, writeContract } = makeClient()
    const relative = await sendArkivTransaction(client, {
      extensions: [{ entityKey: ENTITY_KEY, expires: DAY }],
    })
    const extension = sentExtension(writeContract)
    expect(extension.entityKey).toBe(ENTITY_KEY)
    // A duration is a floor measured from now, not an increment on the entity's current expiry.
    expect(extension.minLifetime).toBe(43_200n)
    expect(extension.expiresAt).toBe(0n)
    expect(relative.extendedExpiries[0]).toBe(CURRENT_BLOCK + 43_200n)

    const { client: client2, writeContract: writeContract2 } = makeClient()
    const absolute = await sendArkivTransaction(client2, {
      extensions: [{ entityKey: ENTITY_KEY, expires: ExpirationTime.atBlock(5_000n) }],
    })
    expect(sentExtension(writeContract2).expiresAt).toBe(5_000n)
    expect(absolute.extendedExpiries[0]).toBe(5_000n)
  })

  it("checks the protocol bounds before spending gas, as a create does", async () => {
    const { client, writeContract } = makeClient()
    const tooLong = ExpirationTime.fromBlocks(Number(PARAMS.maxLifetime + 1n))
    await expect(
      sendArkivTransaction(client, { extensions: [{ entityKey: ENTITY_KEY, expires: tooLong }] }),
    ).rejects.toThrow(/beyond the protocol maximum/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("refuses an extension that says nothing", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { extensions: [{ entityKey: ENTITY_KEY } as never] }),
    ).rejects.toThrow(/must be built with ExpirationTime/)
  })

  it("reads the block height for an extension-only batch", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      extensions: [
        { entityKey: ENTITY_KEY, expires: ExpirationTime.atDate(new Date(Date.now() + 3600_000)) },
      ],
    })
    // A Date can only be placed once the current block is known, so it must have been fetched even
    // though the batch creates nothing.
    expect(sentExtension(writeContract).expiresAt).toBe(CURRENT_BLOCK + 1800n)
  })
})

describe("creation flags and salt", () => {
  it("packs flags into the creationFlags byte", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ ...validCreate, flags: { readonly: true, permissionlessExtension: true } }],
    })
    expect(sentCreate(writeContract).creationFlags).toBe(0b11)
  })

  it("defaults flags to none", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, { creates: [validCreate] })
    expect(sentCreate(writeContract).creationFlags).toBe(0)
  })

  it("defaults the salt to random bits, and honours an explicit one", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, { creates: [validCreate] })
    expect(sentCreate(writeContract).salt).toBeGreaterThan(0n)

    const { client: c2, writeContract: w2 } = makeClient()
    await sendArkivTransaction(c2, { creates: [{ ...validCreate, salt: 0n }] })
    expect(sentCreate(w2).salt).toBe(0n)
  })

  it("rejects a salt wider than the uint128 field", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, salt: 2n ** 128n }] }),
    ).rejects.toThrow(/uint128/)
  })
})

describe("entity keys", () => {
  it("predicts a distinct key per create, advancing the nonce across the batch", async () => {
    const { client } = makeClient()
    const result = await sendArkivTransaction(client, {
      creates: [
        { ...validCreate, salt: 1n },
        { ...validCreate, salt: 1n },
        { ...validCreate, salt: 1n },
      ],
    })
    expect(result.createdEntityKeys).toHaveLength(3)
    // Same salt, different nonce — the nonce is what guarantees uniqueness.
    expect(new Set(result.createdEntityKeys).size).toBe(3)
  })

  it("derives the key from the owner's entity nonce", async () => {
    const { client } = makeClient()
    const result = await sendArkivTransaction(client, { creates: [{ ...validCreate, salt: 5n }] })
    const { predictEntityKey } = await import("../entity/key")
    expect(result.createdEntityKeys[0]).toBe(
      predictEntityKey({
        owner: "0x1111111111111111111111111111111111111111",
        nonce: OWNER_NONCE,
        salt: 5n,
        params: PARAMS,
      }),
    )
  })
})

describe("attribute typing through the write path", () => {
  it("rejects a value that does not fit the type it defaults to", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, attributes: { n: 1.5 } }] }),
    ).rejects.toThrow(InvalidValueError)
  })

  it("rejects an attribute name outside the grammar", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, attributes: { "1bad": 1 } }] }),
    ).rejects.toThrow(InvalidAttributeNameError)
  })

  it("rejects an attribute whose value is absent, rather than writing a typeless one", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [
          {
            ...validCreate,
            // What a spread of an optional-shaped object produces at runtime.
            attributes: { category: "docs", score: undefined } as unknown as AttributeInputs,
          },
        ],
      }),
    ).rejects.toThrow(MissingValueError)
  })

  it("carries only the system cells when there are no user attributes", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, { creates: [validCreate] })
    expect(sentCreate(writeContract).attributes.map((a) => a.name)).toEqual([
      toHex("$contentType", { size: 32 }),
      toHex("$payload", { size: 32 }),
    ])
  })

  it("writes an empty payload rather than dropping it", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ ...validCreate, payload: new Uint8Array() }],
    })
    const byName = Object.fromEntries(sentCreate(writeContract).attributes.map((a) => [a.name, a]))
    expect(byName[toHex("$payload", { size: 32 })]).toMatchObject({ typeId: 6, value: "0x" })
  })

  it("carries the protocol typeId of whichever type the value names", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [
        { ...validCreate, attributes: { count: 42, balance: u256(1n), score: dec("3.5") } },
      ],
    })
    const byName = Object.fromEntries(
      sentCreate(writeContract).attributes.map((a) => [a.name, a.typeId]),
    )
    expect(byName[toHex("count", { size: 32 })]).toBe(2)
    expect(byName[toHex("balance", { size: 32 })]).toBe(3)
    expect(byName[toHex("score", { size: 32 })]).toBe(4)
  })

  it("sends the payload and content type as system cells", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [
        {
          ...validCreate,
          payload: new Uint8Array([1, 2, 3]),
          contentType: "application/json",
          attributes: { level: i32(1) },
        },
      ],
    })
    const byName = Object.fromEntries(sentCreate(writeContract).attributes.map((a) => [a.name, a]))
    expect(byName[toHex("$payload", { size: 32 })]).toMatchObject({ typeId: 6, value: "0x010203" })
    expect(byName[toHex("$contentType", { size: 32 })].typeId).toBe(7)
  })

  it("rejects a content type that is not a MIME token", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, contentType: "Not A Mime" }] }),
    ).rejects.toThrow(/Invalid content type/)
  })

  it("sorts attributes ascending by their bytes32 name", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ ...validCreate, attributes: { tag: "zz", status: "active", score: 30 } }],
    })
    const names = sentCreate(writeContract).attributes.map((a) => a.name)
    expect(names).toEqual([...names].sort())
    // The "$" system cells lead; the user attributes follow in name order.
    expect(names.slice(2)).toEqual([
      toHex("score", { size: 32 }),
      toHex("status", { size: 32 }),
      toHex("tag", { size: 32 }),
    ])
  })
})

describe("patch", () => {
  /** The decoded Patch struct of the batch's only patch. */
  function sentPatch(writeContract: ReturnType<typeof vi.fn>) {
    const op = sentOperations(writeContract).find((o) => o.operation === OperationType.Patch)
    if (!op) throw new Error("no Patch operation was sent")
    return decodeAbiParameters(PATCH_PARAMS, op.operationData)[0]
  }

  it("carries only what the patch named", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, set: { level: i32(11) } }],
    })
    const patch = sentPatch(writeContract)
    expect(patch.entityKey).toBe(ENTITY_KEY)
    // No $payload, no $contentType, no tombstones: everything unnamed is left alone.
    expect(patch.mutations).toEqual([
      { name: toHex("level", { size: 32 }), typeId: 2, value: expect.any(String) },
    ])
  })

  it("writes the system cells only when the patch gives them", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, payload: new Uint8Array([9]) }],
    })
    const names = sentPatch(writeContract).mutations.map((m) => m.name)
    expect(names).toEqual([toHex("$payload", { size: 32 })])
  })

  it("tombstones an unset attribute with typeId 0 and an empty value", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, unset: ["draft"] }],
    })
    expect(sentPatch(writeContract).mutations).toEqual([
      { name: toHex("draft", { size: 32 }), typeId: 0, value: "0x" },
    ])
  })

  it("sorts writes and tombstones together, not each half on its own", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [
        {
          entityKey: ENTITY_KEY,
          set: { zeta: "z", beta: "b" },
          unset: ["alpha", "gamma"],
          payload: new Uint8Array([1]),
        },
      ],
    })
    const names = sentPatch(writeContract).mutations.map((m) => m.name)
    expect(names).toEqual([
      toHex("$payload", { size: 32 }),
      toHex("alpha", { size: 32 }),
      toHex("beta", { size: 32 }),
      toHex("gamma", { size: 32 }),
      toHex("zeta", { size: 32 }),
    ])
  })

  it("collapses a name repeated in unset, since it is the same intent twice", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, unset: ["draft", "draft"] }],
    })
    // Two identical tombstones would break the engine's strict-ascending uniqueness rule.
    expect(sentPatch(writeContract).mutations).toHaveLength(1)
  })

  it("rejects a name that is both set and unset", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ entityKey: ENTITY_KEY, set: { level: i32(1) }, unset: ["level"] }],
      }),
    ).rejects.toThrow(ConflictingMutationError)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects a patch with nothing to apply", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, { patches: [{ entityKey: ENTITY_KEY }] }),
    ).rejects.toThrow(EmptyPatchError)
    // Present but empty is just as empty.
    await expect(
      sendArkivTransaction(client, { patches: [{ entityKey: ENTITY_KEY, set: {}, unset: [] }] }),
    ).rejects.toThrow(EmptyPatchError)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("still validates a content type when one is given", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ entityKey: ENTITY_KEY, payload: new Uint8Array(), contentType: "Not A Mime" }],
      }),
    ).rejects.toThrow(/Invalid content type/)
  })

  it("rejects a bare string as unset, rather than tombstoning its letters", async () => {
    const { client, writeContract } = makeClient()
    // A Set is built from any iterable, so "draft" would become tombstones for d, r, a, f and t —
    // five valid attribute names, none of them the one meant, and the real "draft" left untouched.
    await expect(
      sendArkivTransaction(client, {
        patches: [{ entityKey: ENTITY_KEY, unset: "draft" as unknown as string[] }],
      }),
    ).rejects.toThrow(/must be an array of attribute names/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects unsetting a system cell, which belongs to the engine", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { patches: [{ entityKey: ENTITY_KEY, unset: ["$payload"] }] }),
    ).rejects.toThrow(InvalidAttributeNameError)
  })

  it("does not fetch a block height for a patch-only batch", async () => {
    const { client } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    })
    // A patch carries no expiry, so there is nothing to resolve against the chain.
    expect(client.getBlockNumber).not.toHaveBeenCalled()
  })
})

describe("failures that are not reverts", () => {
  it("keeps an unrecognised error's message and the error itself as the cause", async () => {
    const { client } = makeClient()
    // The transaction was broadcast; it is waiting for the receipt that times out. What that error
    // knows — not least the hash it was watching — is the only way to find out whether the patch
    // landed, so summarising it away as "Transaction failed" would strand the caller.
    const timeout = new Error("Timed out while waiting for transaction 0xabc to be confirmed.")
    ;(client.waitForTransactionReceipt as ReturnType<typeof vi.fn>).mockRejectedValue(timeout)

    const failure = await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    }).catch((error: Error) => error)

    expect(failure).toBeInstanceOf(EntityMutationError)
    expect(failure.message).toContain("0xabc")
    expect(failure.cause).toBe(timeout)
  })
})
