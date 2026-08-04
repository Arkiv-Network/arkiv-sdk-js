import { describe, expect, it, vi } from "bun:test"
import { decodeAbiParameters, parseAbiParameters, toHex } from "viem"
import type { UpdateEntityParameters } from "../actions/wallet/updateEntity"
import {
  type AttributeInputs,
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

describe("update", () => {
  it("requires attributes, because a mutation set replaces what it names", async () => {
    const { client, writeContract } = makeClient()
    const update = {
      entityKey: ENTITY_KEY,
      payload: new Uint8Array([1]),
      contentType: "text/plain",
      expiresIn: 1000,
    }
    // @ts-expect-error — omitting `attributes` would erase every attribute on the entity, so the
    // type system makes you say so explicitly rather than letting it happen by default.
    const omitted: UpdateEntityParameters = update

    await sendArkivTransaction(client, { updates: [{ ...omitted, attributes: {} }] })
    expect(sentOperations(writeContract)[0].operation).toBe(OperationType.Patch)
  })
})
