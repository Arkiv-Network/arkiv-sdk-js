import { describe, expect, it, vi } from "bun:test"
import {
  type Abi,
  BaseError,
  ContractFunctionRevertedError,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  type Hex,
  parseAbiParameters,
  toHex,
} from "viem"
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
import { ARKIV_ADDRESS } from "../consts"
import { InvalidExpiryError, NO_SALT } from "../entity"
import { ENTITY_EVENTS_ABI, type EntityEventName } from "../entity/events"
import { MAX_EXPIRES_AT, OperationType } from "../entity/params"
import { EmptyPatchError, EntityMutationError } from "../errors"
import { sendArkivTransaction } from "./arkivTransactions"
import { ExpirationTime } from "./expirationTime"

const ENTITY_KEY = `0x${"ab".repeat(32)}` as const
const OWNER = "0x1111111111111111111111111111111111111111" as const
const CURRENT_BLOCK = 100n
const OWNER_NONCE = 7n

const CREATE_PARAMS = parseAbiParameters(
  "(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)",
)

const EXTEND_PARAMS = parseAbiParameters(
  "(bytes32 entityKey, uint64 expiresAt, uint64 minLifetime)",
)

const PATCH_PARAMS = parseAbiParameters(
  "(bytes32 entityKey, (bytes32 name, uint8 typeId, bytes value)[] mutations)",
)

const mintedKey = (index: number) =>
  `0x${(index + 1).toString(16).padStart(2, "0").repeat(32)}` as Hex

/** What the engine stores: `max(expiresAt, currentBlock + minLifetime)`, resolved at execution. */
const engineExpiry = (expiresAt: bigint, minLifetime: bigint) =>
  expiresAt > CURRENT_BLOCK + minLifetime ? expiresAt : CURRENT_BLOCK + minLifetime

/** One receipt log, built from the same ABI the SDK reads it back with. */
function entityLog(eventName: EntityEventName, args: Record<string, unknown>) {
  const item = getAbiItem({ abi: ENTITY_EVENTS_ABI as Abi, name: eventName })
  if (item === undefined || item.type !== "event") throw new Error(`no event ${eventName}`)
  const unindexed = item.inputs.filter((input) => !("indexed" in input && input.indexed))
  return {
    address: ARKIV_ADDRESS,
    // biome-ignore lint/suspicious/noExplicitAny: the arg shape varies per event by design.
    topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName, args: args as any }),
    data:
      unindexed.length === 0
        ? "0x"
        : encodeAbiParameters(
            unindexed,
            unindexed.map((input) => args[input.name ?? ""]),
          ),
  }
}

/**
 * The events the engine would emit for what was actually put on the wire: one `EntityCreated` per
 * create and one `ExpiryExtended` per extension, each carrying the expiry the engine resolved
 * rather than the one the SDK asked for.
 */
function emittedLogs(writeContract: ReturnType<typeof vi.fn>) {
  const logs: ReturnType<typeof entityLog>[] = []
  let createIndex = 0
  for (const op of sentOperations(writeContract)) {
    if (op.operation === OperationType.Create) {
      const create = decodeAbiParameters(CREATE_PARAMS, op.operationData)[0]
      logs.push(
        entityLog("EntityCreated", {
          entityKey: mintedKey(createIndex++),
          owner: OWNER,
          expiresAt: engineExpiry(create.expiresAt, create.minLifetime),
          creationFlags: create.creationFlags,
        }),
      )
    } else if (op.operation === OperationType.ExtendExpiry) {
      const extend = decodeAbiParameters(EXTEND_PARAMS, op.operationData)[0]
      logs.push(
        entityLog("ExpiryExtended", {
          entityKey: extend.entityKey,
          owner: OWNER,
          expiresAt: engineExpiry(extend.expiresAt, extend.minLifetime),
        }),
      )
    }
  }
  return logs
}

function makeClient() {
  const writeContract = vi.fn().mockResolvedValue("0xdeadbeef")
  const waitForTransactionReceipt = vi.fn(async () => ({
    status: "success",
    transactionHash: "0xdeadbeef",
    logs: emittedLogs(writeContract),
  }))
  const readContract = vi.fn().mockResolvedValue(OWNER_NONCE)
  return {
    client: {
      account: { address: OWNER },
      chain: { id: 1 },
      getBlockNumber: vi.fn().mockResolvedValue(CURRENT_BLOCK),
      readContract,
      writeContract,
      waitForTransactionReceipt,
    } as unknown as ArkivClient,
    writeContract,
    waitForTransactionReceipt,
    readContract,
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

  it("checks the wire bounds before spending gas, as a create does", async () => {
    const { client, writeContract } = makeClient()
    const tooFar = ExpirationTime.atBlock(MAX_EXPIRES_AT + 1n)
    await expect(
      sendArkivTransaction(client, { extensions: [{ entityKey: ENTITY_KEY, expires: tooFar }] }),
    ).rejects.toThrow(/does not fit the uint64/)
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

  it("sends a zero salt for a create that opts out with NO_SALT", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, { creates: [{ ...validCreate, salt: NO_SALT }] })
    expect(sentCreate(writeContract).salt).toBe(0n)
  })

  it("rejects a salt wider than the uint128 field", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, salt: 2n ** 128n }] }),
    ).rejects.toThrow(/uint128/)
  })
})

describe("entity keys", () => {
  it("reports the key the engine minted, in batch order", async () => {
    const { client } = makeClient()
    const result = await sendArkivTransaction(client, {
      creates: [
        { ...validCreate, salt: 1n },
        { ...validCreate, salt: 1n },
        { ...validCreate, salt: 1n },
      ],
    })
    // These come from the EntityCreated logs, so they are what the engine recorded rather than
    // what the SDK guessed — and the same salt three times cannot make them collide.
    expect(result.createdEntityKeys).toEqual([mintedKey(0), mintedKey(1), mintedKey(2)])
  })

  it("never reads the entity nonce, so two creates in flight cannot collide", async () => {
    // The nonce read was the race: two creates issued before either was mined both read the same
    // value, and one of them then returned a key the engine never minted. Reading the key back
    // from the receipt removes the window rather than narrowing it — and saves a round trip.
    const { client, readContract } = makeClient()
    await sendArkivTransaction(client, { creates: [validCreate] })
    expect(readContract).not.toHaveBeenCalled()
  })

  it("reports the expiry the engine resolved, not the one the SDK asked for", async () => {
    // The engine applies max(expiresAt, currentBlock + minLifetime) against the block the batch
    // actually lands on. Computing it here is a guess about which block that is.
    const { client, waitForTransactionReceipt } = makeClient()
    waitForTransactionReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xdeadbeef",
      logs: [
        entityLog("EntityCreated", {
          entityKey: mintedKey(0),
          owner: OWNER,
          expiresAt: 999_999n,
          creationFlags: 0,
        }),
      ],
    })

    const result = await sendArkivTransaction(client, { creates: [validCreate] })
    expect(result.createdExpiries[0]).toBe(999_999n)
  })

  it("ignores logs from another contract in the same transaction", async () => {
    const { client, waitForTransactionReceipt } = makeClient()
    const created = entityLog("EntityCreated", {
      entityKey: mintedKey(0),
      owner: OWNER,
      expiresAt: 500n,
      creationFlags: 0,
    })
    waitForTransactionReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xdeadbeef",
      logs: [{ ...created, address: "0x9999999999999999999999999999999999999999" }, created],
    })

    const result = await sendArkivTransaction(client, { creates: [validCreate] })
    expect(result.createdEntityKeys).toEqual([mintedKey(0)])
  })

  it("refuses to guess when the events do not account for every create", async () => {
    const { client, waitForTransactionReceipt } = makeClient()
    waitForTransactionReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xdeadbeef",
      logs: [],
    })

    const failure = await sendArkivTransaction(client, {
      creates: [validCreate, validCreate],
    }).catch((error: Error) => error)

    expect(failure).toBeInstanceOf(EntityMutationError)
    // This throws *after* a successful write, so the message has to stop a caller reading it as a
    // failure and retrying — which would create the entities a second time.
    expect(failure.message).toContain("do not retry")
    expect(failure.message).toContain("0xdeadbeef")
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
    expect(byName[toHex("$payload", { size: 32 })]).toMatchObject({ typeId: 7, value: "0x" })
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
    expect(byName[toHex("balance", { size: 32 })]).toBe(4)
    expect(byName[toHex("score", { size: 32 })]).toBe(5)
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
    expect(byName[toHex("$payload", { size: 32 })]).toMatchObject({ typeId: 7, value: "0x010203" })
    expect(byName[toHex("$contentType", { size: 32 })].typeId).toBe(8)
  })

  it("rejects a content type that is not a MIME token", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, contentType: "Not A Mime" }] }),
    ).rejects.toThrow(/Invalid content type/)
  })

  it("accepts MIME parameters with token and quoted-string values", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [
        { ...validCreate, contentType: "text/plain; charset=utf-8" },
        {
          ...validCreate,
          contentType: "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxk",
        },
        { ...validCreate, contentType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' },
        { ...validCreate, contentType: 'multipart/form-data; name="myFile"; filename="foo.txt"' },
      ],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)
  })

  it("rejects malformed MIME parameters", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [
          // invalid optional parameter (no `=`, and no `value`)
          { ...validCreate, contentType: "text/plain; charset" },
          //  invalid optional parameter (no `value` after `=`)
          { ...validCreate, contentType: "text/plain; charset=" },
          // missing `type/`
          { ...validCreate, contentType: 'form-data; name="myFile"; filename="foo.txt"' },
          // missing `type` before `/`
          { ...validCreate, contentType: '/form-data; name="myFile"; filename="foo.txt"' },
          // missing subtype
          { ...validCreate, contentType: "text; charset=" },
          // do not allow spaces
          { ...validCreate, contentType: "text/plain; charset=utf-8     " },
        ],
      }),
    ).rejects.toThrow(/Invalid content type/)
    await expect(
      sendArkivTransaction(client, {
        creates: [{ ...validCreate, contentType: 'text/plain; charset="utf-8' }],
      }),
    ).rejects.toThrow(/Invalid content type/)
    expect(writeContract).not.toHaveBeenCalled()
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

describe("a revert the node catches before there is a receipt", () => {
  /** A decoded engine revert, wrapped the way viem delivers one out of `writeContract`. */
  function preflightRevert(errorName: string, args: readonly unknown[]) {
    const inner = new ContractFunctionRevertedError({ abi: [], functionName: "execute" })
    Object.assign(inner, { data: { errorName, args } })
    return new BaseError('The contract function "execute" reverted.', { cause: inner })
  }

  it("explains it, rather than leaving the explainer to the rarer post-receipt path", async () => {
    // Most reverts never reach the receipt: the node rejects them during gas estimation, so
    // `writeContract` throws and there is nothing to replay. Wiring the named-error decoder only
    // into the replay path would explain the rare case and stay silent on the common one.
    const { client } = makeClient()
    ;(client.writeContract as ReturnType<typeof vi.fn>).mockRejectedValue(
      preflightRevert("ReadOnlyEntity", [ENTITY_KEY]),
    )

    const failure = await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    }).catch((error: Error) => error)

    expect(failure).toBeInstanceOf(EntityMutationError)
    expect(failure.message).toContain("readonly")
    // viem's own rendering prints the decoded args positionally — the right data, none of the
    // meaning — so the point is that it is *not* what surfaces.
    expect(failure.message).not.toContain('The contract function "execute" reverted')
  })

  it("still names a bad attribute-name byte, which only ever fails at estimation", async () => {
    const { client } = makeClient()
    ;(client.writeContract as ReturnType<typeof vi.fn>).mockRejectedValue(
      preflightRevert("Ident32InvalidByte", [2n, "0x2f"]),
    )

    const failure = await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    }).catch((error: Error) => error)

    expect(failure.message).toContain('"/"')
    expect(failure.message).toContain("byte 2")
  })

  it("leaves an error it cannot decode to the existing handling", async () => {
    const { client } = makeClient()
    const opaque = new BaseError("nonce too low")
    ;(client.writeContract as ReturnType<typeof vi.fn>).mockRejectedValue(opaque)

    const failure = await sendArkivTransaction(client, {
      patches: [{ entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    }).catch((error: Error) => error)

    expect(failure.message).toContain("nonce too low")
    expect(failure.cause).toBe(opaque)
  })
})
