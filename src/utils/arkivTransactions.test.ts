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
import type { ArkivClient } from "../clients/baseClient"
import { ARKIV_ADDRESS } from "../consts"
import { InvalidExpiryError, NO_SALT } from "../entity"
import { ENTITY_EVENTS_ABI, type EntityEventName } from "../entity/events"
import { MAX_EXPIRES_AT, OperationType } from "../entity/params"
import { EmptyPatchError, EntityMutationError } from "../errors"
import {
  addr,
  bytes,
  ConflictingMutationError,
  dec,
  defineSchema,
  EntityTooLargeError,
  InvalidAttributeNameError,
  InvalidValueError,
  i32,
  MAX_BYTES_LENGTH,
  MAX_ENTITY_BYTES,
  MissingValueError,
  SchemaMismatchError,
  str,
  u256,
} from "../schema"
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

/** The typeId bit that asks the node to index an attribute. */
const INDEXED = 0x80

const Docs = defineSchema({
  category: str().indexed(),
  level: i32().indexed().optional(),
  title: str().optional(),
})

/** A minimal valid create's schema and values, without its expiry. */
const CONTENTS = { schema: Docs, values: { category: "docs" } }

const DAY = ExpirationTime.fromDays(1) // 86400s -> 43200 blocks at 2s
const validCreate = { ...CONTENTS, expiration: DAY }

const name = (n: string) => toHex(n, { size: 32 })

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
          expiration: ExpirationTime.atBlock(5_000n, { atLeast: ExpirationTime.fromSeconds(200) }),
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
      creates: [{ ...CONTENTS, expiration: DAY }],
    })
    expect(relative.createdExpiries[0]).toBe(CURRENT_BLOCK + 43_200n)

    const { client: client2 } = makeClient()
    const absolute = await sendArkivTransaction(client2, {
      creates: [{ ...CONTENTS, expiration: ExpirationTime.atBlock(5_000n) }],
    })
    expect(absolute.createdExpiries[0]).toBe(5_000n)

    const { client: client3 } = makeClient()
    const dated = await sendArkivTransaction(client3, {
      creates: [
        { ...CONTENTS, expiration: ExpirationTime.atDate(new Date(Date.now() + 3600_000)) },
      ],
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
        creates: [{ ...CONTENTS, expiration: ExpirationTime.atBlock(CURRENT_BLOCK - 1n) }],
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
      extensions: [{ entityKey: ENTITY_KEY, expiration: DAY }],
    })
    const extension = sentExtension(writeContract)
    expect(extension.entityKey).toBe(ENTITY_KEY)
    // A duration is a floor measured from now, not an increment on the entity's current expiry.
    expect(extension.minLifetime).toBe(43_200n)
    expect(extension.expiresAt).toBe(0n)
    expect(relative.extendedExpiries[0]).toBe(CURRENT_BLOCK + 43_200n)

    const { client: client2, writeContract: writeContract2 } = makeClient()
    const absolute = await sendArkivTransaction(client2, {
      extensions: [{ entityKey: ENTITY_KEY, expiration: ExpirationTime.atBlock(5_000n) }],
    })
    expect(sentExtension(writeContract2).expiresAt).toBe(5_000n)
    expect(absolute.extendedExpiries[0]).toBe(5_000n)
  })

  it("checks the wire bounds before spending gas, as a create does", async () => {
    const { client, writeContract } = makeClient()
    const tooFar = ExpirationTime.atBlock(MAX_EXPIRES_AT + 1n)
    await expect(
      sendArkivTransaction(client, { extensions: [{ entityKey: ENTITY_KEY, expiration: tooFar }] }),
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
        {
          entityKey: ENTITY_KEY,
          expiration: ExpirationTime.atDate(new Date(Date.now() + 3600_000)),
        },
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

describe("create through a schema", () => {
  /** The create's attributes, keyed by their bytes32 name. */
  function sentCells(writeContract: ReturnType<typeof vi.fn>) {
    return Object.fromEntries(sentCreate(writeContract).attributes.map((a) => [a.name, a]))
  }

  it("rejects a value that does not fit the type it defaults to", async () => {
    const { client } = makeClient()
    const schema = defineSchema({ n: i32() })
    await expect(
      sendArkivTransaction(client, { creates: [{ schema, values: { n: 1.5 }, expiration: DAY }] }),
    ).rejects.toThrow(InvalidValueError)
  })

  it("rejects a column name outside the grammar before anything is written", () => {
    expect(() => defineSchema({ "1bad": i32() })).toThrow(InvalidAttributeNameError)
  })

  it("rejects a null value, rather than writing a typeless one", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [{ ...validCreate, values: { category: "docs", title: null as never } }],
      }),
    ).rejects.toThrow(MissingValueError)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects a create that leaves out a required column", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, values: {} }] }),
    ).rejects.toThrow(SchemaMismatchError)
    // Explicitly undefined is the same as left out.
    await expect(
      sendArkivTransaction(client, {
        creates: [{ ...validCreate, values: { category: undefined } as never }],
      }),
    ).rejects.toThrow(/required str column/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("checks the schema before any network call, so a transport failure cannot mask it", async () => {
    const { client } = makeClient()
    const getBlockNumber = (client as unknown as { getBlockNumber: ReturnType<typeof vi.fn> })
      .getBlockNumber
    getBlockNumber.mockRejectedValue(new Error("fetch failed"))
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, values: {} }] }),
    ).rejects.toThrow(SchemaMismatchError)
    expect(getBlockNumber).not.toHaveBeenCalled()
  })

  it("rejects a column the schema does not have", async () => {
    const { client } = makeClient()
    const failure = await sendArkivTransaction(client, {
      creates: [{ ...validCreate, values: { category: "docs", nope: 1 } }],
    }).catch((error: Error) => error)
    expect(failure).toBeInstanceOf(SchemaMismatchError)
    expect((failure as SchemaMismatchError).columnName).toBe("nope")
  })

  it("rejects a value whose type is not its column's", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, values: { category: i32(1) } }] }),
    ).rejects.toThrow(SchemaMismatchError)
    // A bare string is a str, never coerced into the column's type.
    const schema = defineSchema({ score: dec() })
    await expect(
      sendArkivTransaction(client, {
        creates: [{ schema, values: { score: "4.1" }, expiration: DAY }],
      }),
    ).rejects.toThrow(/a dec column, but the value is a str/)
  })

  it("lets an optional column be left out entirely", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, { creates: [validCreate] })
    expect(sentCreate(writeContract).attributes.map((a) => a.name)).toEqual([name("category")])
  })

  it("writes a defaulted column's default when the create leaves it out", async () => {
    const schema = defineSchema({ category: str(), mimeType: str().default("text/markdown") })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ schema, values: { category: "docs" }, expiration: DAY }],
    })
    expect(sentCells(writeContract)[name("mimeType")]).toMatchObject({
      typeId: 8,
      value: toHex("text/markdown"),
    })

    // ...and the value given, when it is given.
    const { client: c2, writeContract: w2 } = makeClient()
    await sendArkivTransaction(c2, {
      creates: [{ schema, values: { category: "docs", mimeType: "text/plain" }, expiration: DAY }],
    })
    expect(sentCells(w2)[name("mimeType")].value).toBe(toHex("text/plain"))
  })

  it("flags indexed columns in bit 7 of the typeId, and leaves the rest unindexed", async () => {
    const schema = defineSchema({
      count: i32().indexed(),
      balance: u256().indexed(),
      score: dec().indexed(),
      author: addr(),
      title: str(),
    })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [
        {
          schema,
          values: {
            count: 42,
            balance: u256(1n),
            score: dec("3.5"),
            author: addr("0x1111111111111111111111111111111111111111"),
            title: "Cells",
          },
          expiration: DAY,
        },
      ],
    })
    const typeIds = Object.fromEntries(
      sentCreate(writeContract).attributes.map((a) => [a.name, a.typeId]),
    )
    expect(typeIds[name("count")]).toBe(INDEXED | 2)
    expect(typeIds[name("balance")]).toBe(INDEXED | 4)
    expect(typeIds[name("score")]).toBe(INDEXED | 5)
    expect(typeIds[name("author")]).toBe(9)
    expect(typeIds[name("title")]).toBe(8)
  })

  it("writes any number of bytes columns, unindexed, from bare Uint8Arrays or bytes()", async () => {
    const schema = defineSchema({ body: bytes(), thumbnail: bytes(), empty: bytes() })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [
        {
          schema,
          values: {
            body: new Uint8Array([1, 2, 3]),
            thumbnail: bytes("0xDEAD"),
            empty: new Uint8Array(),
          },
          expiration: DAY,
        },
      ],
    })
    const cells = sentCells(writeContract)
    expect(cells[name("body")]).toMatchObject({ typeId: 7, value: "0x010203" })
    expect(cells[name("thumbnail")]).toMatchObject({ typeId: 7, value: "0xdead" })
    // Empty is a value, not an absence: it is written rather than dropped.
    expect(cells[name("empty")]).toMatchObject({ typeId: 7, value: "0x" })
  })

  it("caps each bytes value at 128 KiB", async () => {
    const schema = defineSchema({ body: bytes(), thumbnail: bytes().optional() })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ schema, values: { body: new Uint8Array(MAX_BYTES_LENGTH) }, expiration: DAY }],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)

    const { client: c2 } = makeClient()
    await expect(
      sendArkivTransaction(c2, {
        creates: [
          { schema, values: { body: new Uint8Array(MAX_BYTES_LENGTH + 1) }, expiration: DAY },
        ],
      }),
    ).rejects.toThrow(InvalidValueError)
  })

  it("caps the bytes of one create at 128 KiB in total", async () => {
    const schema = defineSchema({ body: bytes(), thumbnail: bytes() })
    const half = new Uint8Array(MAX_ENTITY_BYTES / 2)
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ schema, values: { body: half, thumbnail: half }, expiration: DAY }],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)

    const { client: c2, writeContract: w2 } = makeClient()
    await expect(
      sendArkivTransaction(c2, {
        creates: [
          {
            schema,
            values: { body: half, thumbnail: new Uint8Array(MAX_ENTITY_BYTES / 2 + 1) },
            expiration: DAY,
          },
        ],
      }),
    ).rejects.toThrow(EntityTooLargeError)
    expect(w2).not.toHaveBeenCalled()
  })

  it("carries no cells for a schema with no columns", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ schema: defineSchema({}), values: {}, expiration: DAY }],
    })
    expect(sentCreate(writeContract).attributes).toEqual([])
  })

  it("sorts attributes ascending by their bytes32 name", async () => {
    const schema = defineSchema({ tag: str(), status: str().indexed(), score: i32() })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ schema, values: { tag: "zz", status: "active", score: 30 }, expiration: DAY }],
    })
    expect(sentCreate(writeContract).attributes.map((a) => a.name)).toEqual([
      name("score"),
      name("status"),
      name("tag"),
    ])
  })

  it("writes each create of a batch through its own schema", async () => {
    const Files = defineSchema({ path: str().indexed(), body: bytes() })
    const { client, writeContract } = makeClient()
    const result = await sendArkivTransaction(client, {
      creates: [
        validCreate,
        { schema: Files, values: { path: "/a", body: new Uint8Array([7]) }, expiration: DAY },
      ],
    })
    const [docs, files] = sentOperations(writeContract).map(
      (op) => decodeAbiParameters(CREATE_PARAMS, op.operationData)[0],
    )
    expect(docs.attributes.map((a) => [a.name, a.typeId])).toEqual([
      [name("category"), INDEXED | 8],
    ])
    expect(files.attributes.map((a) => [a.name, a.typeId])).toEqual([
      [name("body"), 7],
      [name("path"), INDEXED | 8],
    ])
    expect(result.createdEntityKeys).toEqual([mintedKey(0), mintedKey(1)])
  })
})

describe("patch", () => {
  /** The decoded Patch struct of the batch's only patch. */
  function sentPatch(writeContract: ReturnType<typeof vi.fn>) {
    const op = sentOperations(writeContract).find((o) => o.operation === OperationType.Patch)
    if (!op) throw new Error("no Patch operation was sent")
    return decodeAbiParameters(PATCH_PARAMS, op.operationData)[0]
  }

  it("carries only what the patch named, flagged as its column declares", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(11) } }],
    })
    const patch = sentPatch(writeContract)
    expect(patch.entityKey).toBe(ENTITY_KEY)
    // No tombstones, nothing unnamed: everything else is left alone.
    expect(patch.mutations).toEqual([
      { name: name("level"), typeId: INDEXED | 2, value: expect.any(String) },
    ])
  })

  it("flips a column's indexing when the schema writing it says so", async () => {
    const Indexed = defineSchema({ title: str().indexed() })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema: Indexed, entityKey: ENTITY_KEY, set: { title: "x" } }],
    })
    expect(sentPatch(writeContract).mutations[0].typeId).toBe(INDEXED | 8)

    const { client: c2, writeContract: w2 } = makeClient()
    await sendArkivTransaction(c2, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { title: "x" } }],
    })
    expect(sentPatch(w2).mutations[0].typeId).toBe(8)
  })

  it("does not apply defaults — a patch writes only what it names", async () => {
    const schema = defineSchema({ category: str(), mimeType: str().default("text/markdown") })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema, entityKey: ENTITY_KEY, set: { category: "x" } }],
    })
    expect(sentPatch(writeContract).mutations.map((m) => m.name)).toEqual([name("category")])
  })

  it("tombstones an unset optional column with typeId 0 and an empty value", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, unset: ["title"] }],
    })
    expect(sentPatch(writeContract).mutations).toEqual([
      { name: name("title"), typeId: 0, value: "0x" },
    ])
  })

  it("refuses to unset a required column", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, unset: ["category" as never] }],
      }),
    ).rejects.toThrow(SchemaMismatchError)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects a set of a column the schema does not have, or of the wrong type", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { nope: 1 } as never }],
      }),
    ).rejects.toThrow(SchemaMismatchError)
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: "high" } as never }],
      }),
    ).rejects.toThrow(/i32 column, but the value is a str/)
  })

  it("leaves out a column set to undefined, as a create does", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: undefined, title: "x" } }],
    })
    expect(sentPatch(writeContract).mutations.map((m) => m.name)).toEqual([name("title")])
  })

  it("treats a patch of nothing but undefined values as empty", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: undefined } }],
      }),
    ).rejects.toThrow(EmptyPatchError)
  })

  it("does not count an undefined set as conflicting with an unset", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [
        { schema: Docs, entityKey: ENTITY_KEY, set: { title: undefined }, unset: ["title"] },
      ],
    })
    expect(sentPatch(writeContract).mutations).toEqual([
      { name: name("title"), typeId: 0, value: "0x" },
    ])
  })

  it("still rejects null, which is not 'left out'", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: null } as never }],
      }),
    ).rejects.toThrow(MissingValueError)
  })

  it("sorts writes and tombstones together, not each half on its own", async () => {
    const schema = defineSchema({
      zeta: str(),
      beta: str(),
      alpha: str().optional(),
      gamma: str().optional(),
    })
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [
        {
          schema,
          entityKey: ENTITY_KEY,
          set: { zeta: "z", beta: "b" },
          unset: ["alpha", "gamma"],
        },
      ],
    })
    expect(sentPatch(writeContract).mutations.map((m) => m.name)).toEqual([
      name("alpha"),
      name("beta"),
      name("gamma"),
      name("zeta"),
    ])
  })

  it("collapses a name repeated in unset, since it is the same intent twice", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, unset: ["title", "title"] }],
    })
    // Two identical tombstones would break the engine's strict-ascending uniqueness rule.
    expect(sentPatch(writeContract).mutations).toHaveLength(1)
  })

  it("rejects a name that is both set and unset", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [
          { schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(1) }, unset: ["level"] },
        ],
      }),
    ).rejects.toThrow(ConflictingMutationError)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects a patch with nothing to apply", async () => {
    const { client, writeContract } = makeClient()
    await expect(
      sendArkivTransaction(client, { patches: [{ schema: Docs, entityKey: ENTITY_KEY }] }),
    ).rejects.toThrow(EmptyPatchError)
    // Present but empty is just as empty.
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: {}, unset: [] }],
      }),
    ).rejects.toThrow(EmptyPatchError)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects a bare string as unset, rather than tombstoning its letters", async () => {
    const { client, writeContract } = makeClient()
    // A Set is built from any iterable, so "title" would become tombstones for t, i, t, l and e —
    // and the real "title" left untouched.
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, unset: "title" as never }],
      }),
    ).rejects.toThrow(/must be an array of column names/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("rejects unsetting a system attribute, which is no column of any schema", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        patches: [{ schema: Docs, entityKey: ENTITY_KEY, unset: ["$owner" as never] }],
      }),
    ).rejects.toThrow(SchemaMismatchError)
  })

  it("does not fetch a block height for a patch-only batch", async () => {
    const { client } = makeClient()
    await sendArkivTransaction(client, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(1) } }],
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
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(1) } }],
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
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(1) } }],
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
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    }).catch((error: Error) => error)

    expect(failure.message).toContain('"/"')
    expect(failure.message).toContain("byte 2")
  })

  it("leaves an error it cannot decode to the existing handling", async () => {
    const { client } = makeClient()
    const opaque = new BaseError("nonce too low")
    ;(client.writeContract as ReturnType<typeof vi.fn>).mockRejectedValue(opaque)

    const failure = await sendArkivTransaction(client, {
      patches: [{ schema: Docs, entityKey: ENTITY_KEY, set: { level: i32(1) } }],
    }).catch((error: Error) => error)

    expect(failure.message).toContain("nonce too low")
    expect(failure.cause).toBe(opaque)
  })
})
