import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type {
  CreateEntityValues,
  CreationFlags,
  EntityEvent,
  Expiry,
  PublicArkivClient,
  Schema,
  WalletArkivClient,
} from "@arkiv-network/sdk"
import {
  createPublicClient,
  createWalletClient,
  EntityMutationError,
  ExpirationTime,
  NoEntityFoundError,
  predictEntityKey,
  SchemaMismatchError,
} from "@arkiv-network/sdk"
import {
  and,
  asc,
  between,
  type Expression,
  eq,
  exists,
  gt,
  gte,
  InvalidPredicateError,
  lt,
  lte,
  or,
  type SchemaRef,
  startsWith,
} from "@arkiv-network/sdk/query"
import {
  addr,
  bool,
  bytes,
  dec,
  defineSchema,
  i32,
  key,
  str,
  u64,
  u256,
} from "@arkiv-network/sdk/schema"
import type { StartedTestContainer } from "testcontainers"
import {
  checksumAddress,
  type Hex,
  hexToString,
  http,
  parseEther,
  stringToBytes,
  webSocket,
} from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { execCommand, launchLocalArkivNode } from "./utils.js"

const basicCRUDTestTimeout: number = parseInt(process.env.ARKIV_SDK_TEST_CRUD_TIMEOUT || "30000")

const usesContainer = !(process.env.ARKIV_SDK_TEST_RPC_URL || process.env.ARKIV_SDK_TEST_WS_URL)

type TransportName = "http" | "webSocket"
const transports: TransportName[] = ["http", "webSocket"]

/** A lifetime long enough to outlive any test here. */
const LIFETIME = ExpirationTime.fromBlocks(10_000)

const SOMEONE_ELSE = checksumAddress("0x1231231231231231231231231231231231231231")

/**
 * The general-purpose schema most tests write through: an indexed tag to find an entity by, and an
 * unindexed body and content type standing in for what used to be the payload.
 */
const Notes = defineSchema({
  tag: str().indexed().optional(),
  body: bytes().optional(),
  mimeType: str().default("text/plain"),
})

describe("Arkiv Integration Tests for public client", () => {
  let arkivNode: StartedTestContainer | undefined
  let publicClient: PublicArkivClient
  let publicClientWS: PublicArkivClient
  let walletClient: WalletArkivClient
  let walletClientWS: WalletArkivClient
  let chainId: number
  let httpUrl: string
  const privateKey = process.env.PRIVATE_KEY as Hex
  const account = privateKeyToAccount(privateKey)

  function clients(transport: TransportName) {
    return transport === "http"
      ? { read: publicClient, write: walletClient }
      : { read: publicClientWS, write: walletClientWS }
  }

  beforeAll(async () => {
    let rpcName: string

    let httpUrls: [string]
    let wsUrls: [string]
    if (!usesContainer) {
      httpUrls = [process.env.ARKIV_SDK_TEST_RPC_URL || "undefined"]
      wsUrls = [process.env.ARKIV_SDK_TEST_WS_URL || "undefined"]
      rpcName = "External Arkiv Node"
      chainId = parseInt(process.env.ARKIV_SDK_TEST_CHAIN_ID || "1337")
    } else {
      const { container, httpPort, wsPort } = await launchLocalArkivNode(account.address)
      rpcName = "Containerized Arkiv Node"
      arkivNode = container
      httpUrls = [`http://127.0.0.1:${httpPort}`]
      wsUrls = [`ws://127.0.0.1:${wsPort}`]
      chainId = 1337
    }
    httpUrl = httpUrls[0]

    const localTestNetwork = {
      id: chainId,
      name: rpcName,
      nativeCurrency: {
        decimals: 18,
        name: "Ether",
        symbol: "ETH",
      },
      rpcUrls: {
        default: {
          http: httpUrls,
          webSocket: wsUrls,
        },
      },
    }

    publicClient = createPublicClient({
      transport: http(),
      chain: localTestNetwork,
    })
    publicClientWS = createPublicClient({
      transport: webSocket(),
      chain: localTestNetwork,
    })
    walletClient = createWalletClient({
      transport: http(),
      chain: localTestNetwork,
      account,
    })
    walletClientWS = createWalletClient({
      transport: webSocket(),
      chain: localTestNetwork,
      account,
    })
  }, 60000)

  afterAll(async () => {
    if (arkivNode) {
      await arkivNode.stop()
    }
  })

  async function createEntityForTest(transport: TransportName) {
    if (arkivNode) {
      // TODO: the CLI in the dev image still speaks payload/content-type. Switch this to its
      // column syntax once the node ships user-defined columns.
      const command = [
        "arkiv-cli",
        "--private-key",
        privateKey,
        "create",
        "--payload",
        "Hello world",
        "--content-type",
        "text/plain",
        "--min-lifetime",
        "10000",
      ]

      const result = await execCommand(arkivNode, command)
      const match = result.match(/entity_key:(.*)/)
      if (!match || !match[1]) {
        throw new Error(
          `Failed to parse entity key from CLI output. Expected format "entity_key: <hex>". Actual output:\n${result}`,
        )
      }
      return match[1].trim() as Hex
    }

    const { entityKey } = await clients(transport).write.createEntity(
      Notes,
      { body: stringToBytes("Hello world") },
      { expiration: LIFETIME },
    )

    return entityKey
  }

  /**
   * Waits for a transaction's receipt, then for its block to be readable. The node can report a
   * block before its arkiv_* reads see it, but a read of account state at `latest` waits for the
   * block, so one such read holds the test until the write shows up.
   */
  async function landed(read: PublicArkivClient, hash: Hex) {
    const receipt = await read.waitForTransactionReceipt({ hash })
    await read.getTransactionCount({ address: account.address, blockTag: "latest" })
    return receipt
  }

  /** Creates one entity through the SDK and waits for it to land. */
  async function create<S extends Schema>(
    transport: TransportName,
    schema: S,
    values: CreateEntityValues<S>,
    options: { flags?: CreationFlags; expiration?: Expiry } = {},
  ) {
    const { read, write } = clients(transport)
    const created = await write.createEntity(schema, values, {
      expiration: options.expiration ?? LIFETIME,
      ...(options.flags ? { flags: options.flags } : {}),
    })
    const receipt = await landed(read, created.txHash)
    return { ...created, blockNumber: receipt.blockNumber }
  }

  /** Waits for `predicate` to hold, polling — for the few things that are not tx-confirmed. */
  async function eventually(predicate: () => boolean | Promise<boolean>, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await predicate()) return true
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  }

  // ---------------------------------------------------------------------------------------------
  // The node, and the plumbing that reaches it
  // ---------------------------------------------------------------------------------------------

  test.each(transports)(
    "the node reports its chain, head and timing over %s",
    async (transport) => {
      const { read } = clients(transport)

      expect(await read.getChainId()).toBe(chainId)

      const blockNumber = await read.getBlockNumber()
      expect(typeof blockNumber).toBe("bigint")
      expect(blockNumber).toBeGreaterThanOrEqual(0n)

      const blockTiming = await read.getBlockTiming()
      expect(typeof blockTiming.currentBlock).toBe("bigint")
      expect(blockTiming.currentBlock).toBeGreaterThanOrEqual(blockNumber)
      expect(blockTiming.currentBlockTime).toBeGreaterThan(0)
      expect(blockTiming.blockDuration).toBeGreaterThanOrEqual(0)
    },
  )

  test.each(transports)(
    "an entity another writer created reads back in full over %s",
    async (transport) => {
      const { read } = clients(transport)
      const testKey = await createEntityForTest(transport)

      const entity = await read.getEntity(testKey)

      expect(entity.$key).toBe(testKey)
      expect(entity.$attributes).toBeDefined()
      expect(entity.$owner).toBe(account.address)
      expect(entity.$creator).toBe(account.address)
      expect(entity.$expiresAt).toBeGreaterThan(entity.$createdAt)
      expect(entity.$createdAt).toBeGreaterThan(0n)
      expect(entity.$updatedAt).toBe(entity.$createdAt)
      expect(entity.$creationFlags).toEqual({
        readonly: false,
        permissionlessExtension: false,
        raw: 0,
      })
    },
  )

  test.each(transports)("a key that was never created has no entity over %s", async (transport) => {
    const { read } = clients(transport)
    const nonExistentKey = "0x567b6b2dfe0d9f87f054b9e3282a579630cab0b011643c4912f3b8b172b14fb7"

    await expect(read.getEntity(nonExistentKey)).rejects.toThrow(NoEntityFoundError)
    await expect(read.getEntity(nonExistentKey, Notes)).rejects.toThrow(NoEntityFoundError)
  })

  // ---------------------------------------------------------------------------------------------
  // The entity lifecycle
  // ---------------------------------------------------------------------------------------------

  test.each(transports)(
    "an entity is created, patched, extended and deleted over %s",
    async (transport) => {
      const { read, write } = clients(transport)
      const Lifecycle = defineSchema({
        testkey: str().indexed().optional(),
        keeper: i32().indexed(),
        added: str().indexed().optional(),
        body: bytes(),
        mimeType: str(),
      })

      const body = stringToBytes(
        JSON.stringify({ entity: { entityType: "test", entityId: "test" } }),
      )
      const { entityKey, txHash, expiresAt } = await write.createEntity(
        Lifecycle,
        { testkey: "testValue", keeper: i32(7), body, mimeType: "application/json" },
        { expiration: LIFETIME },
      )
      await landed(read, txHash)

      const entity = await read.getEntity(entityKey, Lifecycle)
      expect(entity.body).toEqual(bytes(body))
      expect(JSON.parse(hexToString(entity.body.value))).toMatchObject({
        entity: { entityType: "test" },
      })
      expect(entity.testkey).toEqual(str("testValue"))
      expect(entity.added).toBeUndefined()
      expect(entity.$expiresAt).toBe(expiresAt)

      // Patch: new contents, one column set, one unset — and `keeper` left alone
      const updatedBody = stringToBytes("plain text now")
      const { entityKey: patchedKey, txHash: patchedTx } = await write.patchEntity(
        Lifecycle,
        entityKey,
        {
          set: { body: updatedBody, mimeType: "text/plain", added: str("new") },
          unset: ["testkey"],
        },
      )
      await landed(read, patchedTx)
      expect(patchedKey).toBe(entityKey)

      const patched = await read.getEntity(entityKey, Lifecycle)
      expect(hexToString(patched.body.value)).toBe("plain text now")
      expect(patched.mimeType).toEqual(str("text/plain"))
      expect(patched.added).toEqual(str("new"))
      expect(patched.keeper).toEqual(i32(7))
      expect(patched.testkey).toBeUndefined()
      expect(patched.$updatedAt).toBeGreaterThan(patched.$createdAt)

      // The same entity, read without a schema, holds exactly those attributes.
      expect((await read.getEntity(entityKey)).$attributes).toEqual({
        added: str("new"),
        keeper: i32(7),
        body: bytes(updatedBody),
        mimeType: str("text/plain"),
      })

      const { txHash: extendedTx, expiresAt: extendedExpiresAt } = await write.extendEntity({
        entityKey,
        expiration: ExpirationTime.fromBlocks(20_000),
      })
      await landed(read, extendedTx)
      expect(extendedExpiresAt).toBeGreaterThan(expiresAt)
      expect((await read.getEntity(entityKey)).$expiresAt).toBe(extendedExpiresAt)

      // Delete.
      const { txHash: deletedTx } = await write.deleteEntity({ entityKey })
      await landed(read, deletedTx)
      await expect(read.getEntity(entityKey)).rejects.toThrow(NoEntityFoundError)
    },
    { timeout: basicCRUDTestTimeout },
  )

  test(
    "transferring an entity moves it to the new owner and keeps its creator",
    async () => {
      const { entityKey } = await create("http", Notes, { tag: "testValue" })

      const { entityKey: changedKey, txHash } = await walletClient.changeOwnership({
        entityKey,
        newOwner: SOMEONE_ELSE,
      })
      await landed(publicClient, txHash)
      expect(changedKey).toBe(entityKey)

      const entity = await publicClient.getEntity(entityKey)
      expect(entity.$owner).toBe(SOMEONE_ELSE)
      // The creator is fixed at creation and survives a transfer.
      expect(entity.$creator).toBe(account.address)

      // And the entity is no longer ours to change.
      await expect(walletClient.deleteEntity({ entityKey })).rejects.toThrow(EntityMutationError)
    },
    { timeout: 20000 },
  )

  test(
    "creation flags are fixed at creation, and readonly is enforced",
    async () => {
      const { entityKey } = await create(
        "http",
        Notes,
        { tag: str("yes") },
        { flags: { readonly: true } },
      )

      const entity = await publicClient.getEntity(entityKey)
      expect(entity.$creationFlags).toEqual({
        readonly: true,
        permissionlessExtension: false,
        raw: 1,
      })

      await expect(
        walletClient.patchEntity(Notes, entityKey, { set: { tag: str("no") } }),
      ).rejects.toThrow(/readonly/)
      const { txHash } = await walletClient.extendEntity({
        entityKey,
        expiration: ExpirationTime.fromBlocks(20_000),
      })
      await landed(publicClient, txHash)
    },
    { timeout: 20000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Batches
  // ---------------------------------------------------------------------------------------------

  test(
    "a batch applies every one of its operations in one transaction",
    async () => {
      // Five entities to operate on, created in one batch rather than five transactions.
      const seed = await walletClient.executeBatch({
        creates: Array.from({ length: 5 }, () => ({
          schema: Notes,
          values: { tag: "testValue" },
          expiration: LIFETIME,
        })),
      })
      await landed(publicClient, seed.txHash)

      const [toPatch, toDeleteA, toDeleteB, toExtend, toTransfer] = seed.createdEntities
      if (!toPatch || !toDeleteA || !toDeleteB || !toExtend || !toTransfer) {
        throw new Error(`expected 5 seeded keys, got ${seed.createdEntities.length}`)
      }

      const result = await walletClient.executeBatch({
        creates: [{ schema: Notes, values: { tag: "testValue" }, expiration: LIFETIME }],
        patches: [
          {
            schema: Notes,
            entityKey: toPatch,
            set: { tag: "patchedValue", body: stringToBytes("patched") },
          },
        ],
        deletes: [{ entityKey: toDeleteA }, { entityKey: toDeleteB }],
        extensions: [{ entityKey: toExtend, expiration: ExpirationTime.fromBlocks(20_000) }],
        ownershipChanges: [{ entityKey: toTransfer, newOwner: SOMEONE_ELSE }],
      })
      await landed(publicClient, result.txHash)

      expect(result.createdEntities).toHaveLength(1)
      expect(result.patchedEntities).toEqual([toPatch])
      expect(result.deletedEntities).toEqual([toDeleteA, toDeleteB])
      expect(result.extendedEntities).toEqual([toExtend])
      expect(result.ownershipChanges).toEqual([toTransfer])

      // The returned lists say what was asked for; the chain says what happened.
      const patched = await publicClient.getEntity(toPatch, Notes)
      expect(patched.tag).toEqual(str("patchedValue"))
      expect(patched.body).toEqual(bytes(stringToBytes("patched")))
      await expect(publicClient.getEntity(toDeleteA)).rejects.toThrow(NoEntityFoundError)
      await expect(publicClient.getEntity(toDeleteB)).rejects.toThrow(NoEntityFoundError)
      expect((await publicClient.getEntity(toTransfer)).$owner).toBe(SOMEONE_ELSE)
    },
    { timeout: 60000 },
  )

  test(
    "a batch can write entities of several schemas at once",
    async () => {
      const group = `mixed-${crypto.randomUUID()}`
      // Named, so each tags its entities and a query through it sees only its own.
      const Authors = defineSchema("authors", { group: str().indexed(), name: str() })
      const Books = defineSchema("books", {
        group: str().indexed(),
        title: str(),
        pages: i32().indexed(),
      })

      const batch = await walletClient.executeBatch({
        creates: [
          { schema: Authors, values: { group, name: "Ursula" }, expiration: LIFETIME },
          {
            schema: Books,
            values: { group, title: "The Dispossessed", pages: 387 },
            expiration: LIFETIME,
          },
        ],
      })
      await landed(publicClient, batch.txHash)
      const [author, book] = batch.createdEntities as [Hex, Hex]

      expect((await publicClient.getEntity(author, Authors)).name).toEqual(str("Ursula"))
      expect((await publicClient.getEntity(book, Books)).pages).toEqual(i32(387))
      // Read by key through the wrong schema, the tag gives the entity away.
      await expect(publicClient.getEntity(author, Books)).rejects.toThrow(SchemaMismatchError)

      // Both entities carry `group`, but the tag filter keeps the author out of a Books query.
      const books = await publicClient
        .select({ $key: true, title: true })
        .from(Books)
        .where(eq("group", group))
        .fetch()
      expect(books.entities.map((row) => row.$key)).toEqual([book])
      // A named schema needs no other filter to list its entities.
      const everyBook = await publicClient.select({ $key: true }).from(Books).fetch()
      expect(everyBook.entities.map((row) => row.$key)).toContain(book)
      expect(everyBook.entities.map((row) => row.$key)).not.toContain(author)

      // An unnamed schema types a query without filtering it: the author matches `group` too,
      // and does not fit — which is skipped by default, or fails the fetch on request.
      const UntaggedBooks = defineSchema({ group: str().indexed(), title: str() })
      const skipped = await publicClient
        .select({ $key: true, title: true })
        .from(UntaggedBooks)
        .where(eq("group", group))
        .fetch()
      expect(skipped.entities.map((row) => row.$key)).toEqual([book])
      expect(skipped.skipped).toBe(1)
      await expect(
        publicClient
          .select({ $key: true, title: true })
          .from(UntaggedBooks, { onMismatch: "throw" })
          .where(eq("group", group))
          .fetch(),
      ).rejects.toThrow(SchemaMismatchError)
    },
    { timeout: 30000 },
  )

  test(
    "a batch that cannot apply in full applies none of it",
    async () => {
      const ghost = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex
      const marker = `atomic-${crypto.randomUUID()}`

      // One good create, one impossible delete. The create must not survive the batch.
      await expect(
        walletClient.executeBatch({
          creates: [
            {
              schema: Notes,
              values: { tag: marker, body: stringToBytes("should never exist") },
              expiration: LIFETIME,
            },
          ],
          deletes: [{ entityKey: ghost }],
        }),
      ).rejects.toThrow(EntityMutationError)

      const survivors = await publicClient
        .select({ $key: true })
        .from(Notes)
        .where(eq("tag", str(marker)))
        .fetch()
      expect(survivors.entities).toHaveLength(0)
    },
    { timeout: 30000 },
  )

  test(
    "the engine's refusals arrive decoded, not as raw revert data",
    async () => {
      const ghost = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex

      for (const operation of [
        () => walletClient.patchEntity(Notes, ghost, { set: { tag: str("x") } }),
        () => walletClient.deleteEntity({ entityKey: ghost }),
        () => walletClient.extendEntity({ entityKey: ghost, expiration: LIFETIME }),
      ]) {
        await expect(operation()).rejects.toThrow(/no entity 0x11111111/)
      }

      // An extension that would shorten the entity's life is refused by the node
      const { entityKey } = await create("http", Notes, { tag: str("no") })
      const soon = ExpirationTime.atBlock((await publicClient.getBlockNumber()) + 5n)
      await expect(walletClient.extendEntity({ entityKey, expiration: soon })).rejects.toThrow(
        EntityMutationError,
      )
    },
    { timeout: 30000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  test(
    "a query finds entities by attribute, owner and creator",
    async () => {
      const value = `query-${crypto.randomUUID()}`
      const { entityKey } = await create("http", Notes, { tag: str(value) })
      const matches = eq("tag", str(value))

      const byAttribute = await publicClient
        .select({ $key: true })
        .from(Notes)
        .where(matches)
        .fetch()
      expect(byAttribute.entities.map((e) => e.$key)).toEqual([entityKey])

      const byOwner = await publicClient
        .select({ $key: true })
        .where(matches)
        .ownedBy(account.address)
        .fetch()
      expect(byOwner.entities).toHaveLength(1)

      const byCreator = await publicClient
        .select({ $key: true })
        .where(matches)
        .createdBy(account.address)
        .fetch()
      expect(byCreator.entities).toHaveLength(1)

      const byBoth = await publicClient
        .select({ $key: true })
        .where(matches)
        .ownedBy(account.address)
        .createdBy(account.address)
        .fetch()
      expect(byBoth.entities).toHaveLength(1)

      const byStranger = await publicClient
        .select({ $key: true })
        .where(matches)
        .createdBy("0x0000000000000000000000000000000000000000")
        .fetch()
      expect(byStranger.entities).toHaveLength(0)

      const byKey = await publicClient
        .select({ $key: true })
        .where(eq("$key", key(entityKey)))
        .fetch()
      expect(byKey.entities.map((e) => e.$key)).toEqual([entityKey])
    },
    { timeout: 30000 },
  )

  test(
    "a projection returns exactly the fields it asked for",
    async () => {
      const value = `projection-${crypto.randomUUID()}`
      const body = stringToBytes(JSON.stringify({ entity: { entityType: "test" } }))
      await create("http", Notes, { tag: str(value), body, mimeType: "application/json" })
      const where = eq("tag", str(value))

      // key only — the result type is narrowed to exactly { key }, and the RPC must actually omit
      // the rest rather than merely typing it away. That over-fetch guarantee is what select()
      // exists for, so it is asserted at runtime too.
      const keyOnly = await publicClient.select({ $key: true }).where(where).fetch()
      expect(keyOnly.entities[0]?.$key).toBeDefined()
      // @ts-expect-error owner was not selected
      expect(keyOnly.entities[0]?.$owner).toBeUndefined()
      // @ts-expect-error attributes were not selected
      expect(keyOnly.entities[0]?.$attributes).toBeUndefined()
      // @ts-expect-error creator was not selected
      expect(keyOnly.entities[0]?.$creator).toBeUndefined()
      // @ts-expect-error expiresAt was not selected
      expect(keyOnly.entities[0]?.$expiresAt).toBeUndefined()
      // @ts-expect-error createdAt was not selected
      expect(keyOnly.entities[0]?.$createdAt).toBeUndefined()
      // @ts-expect-error updatedAt was not selected
      expect(keyOnly.entities[0]?.$updatedAt).toBeUndefined()

      const metadataOnly = await publicClient
        .select({
          $owner: true,
          $creator: true,
          $expiresAt: true,
          $createdAt: true,
          $updatedAt: true,
          $creationFlags: true,
        })
        .where(where)
        .fetch()
      expect(metadataOnly.entities[0]?.$owner).toBe(account.address)
      expect(metadataOnly.entities[0]?.$creator).toBe(account.address)
      expect(metadataOnly.entities[0]?.$expiresAt).toBeGreaterThan(0n)
      expect(metadataOnly.entities[0]?.$createdAt).toBeGreaterThan(0n)
      expect(metadataOnly.entities[0]?.$updatedAt).toBeGreaterThan(0n)
      expect(metadataOnly.entities[0]?.$creationFlags.raw).toBe(0)
      // @ts-expect-error attributes were not selected
      expect(metadataOnly.entities[0]?.$attributes).toBeUndefined()

      const attributesOnly = await publicClient.select({ $attributes: true }).where(where).fetch()
      expect(attributesOnly.entities[0]?.$attributes.tag).toEqual(str(value))
      // @ts-expect-error key was not selected
      expect(attributesOnly.entities[0]?.$key).toBeUndefined()

      // The schema projection names the types and indexing without paying for the values.
      const schemaOnly = await publicClient.select({ $attributeSchema: true }).where(where).fetch()
      expect(schemaOnly.entities[0]?.$attributeSchema).toEqual({
        tag: { type: "str", indexed: true },
        body: { type: "bytes", indexed: false },
        mimeType: { type: "str", indexed: false },
      })

      // Attributes are selected by name, each as a field of its own.
      const oneAttribute = await publicClient.select({ $key: true, tag: true }).where(where).fetch()
      expect(oneAttribute.entities[0]?.tag).toEqual(str(value))
      expect(oneAttribute.entities[0]).not.toHaveProperty("$attributes")

      // No selection at all is every field.
      const everything = await publicClient.select().where(where).fetch()
      expect(everything.entities[0]?.$key).toBeDefined()
      expect(everything.entities[0]?.$owner).toBe(account.address)
      expect(everything.entities[0]?.$attributes.tag).toEqual(str(value))
      expect(everything.entities[0]?.$attributes.body).toEqual(bytes(body))

      // Through the schema, entity fields and columns sit side by side in one flat row.
      const rows = await publicClient
        .select({ $key: true, $owner: true, body: true })
        .from(Notes)
        .where(where)
        .fetch()
      const row = rows.entities[0]
      if (!row) throw new Error("no row returned through the schema")
      expect(row.$owner).toBe(account.address)
      expect(row.body).toEqual(bytes(body))
      // @ts-expect-error mimeType was not selected
      expect(row.mimeType).toBeUndefined()

      // And everything through the schema is every field and every column.
      const fullRow = (await publicClient.select().from(Notes).where(where).fetch()).entities[0]
      expect(fullRow?.mimeType).toEqual(str("application/json"))
      expect(fullRow?.tag).toEqual(str(value))
      expect(fullRow?.$creator).toBe(account.address)
    },
    { timeout: 30000 },
  )

  test(
    "the operators the engine supports filter as written",
    async () => {
      const group = `operators-${crypto.randomUUID()}`
      const Ranges = defineSchema({
        rangegroup: str().indexed(),
        rangescore: i32().indexed(),
        label: str().indexed(),
      })
      const created = await walletClient.executeBatch({
        creates: [100, 200, 300, 400, 500].map((score) => ({
          schema: Ranges,
          values: { rangegroup: group, rangescore: i32(score), label: str(`score-${score}`) },
          expiration: LIFETIME,
        })),
      })
      await landed(publicClient, created.txHash)

      const inGroup = eq("rangegroup", str(group))
      const scores = async (predicate: Expression<SchemaRef<typeof Ranges>>) => {
        const page = await publicClient
          .select({ rangescore: true })
          .from(Ranges)
          .where(and(inGroup, predicate))
          .fetch()
        return page.entities.map((row) => row.rangescore.value).sort((a, b) => a - b)
      }

      expect(await scores(eq("rangescore", i32(300)))).toEqual([300])
      expect(await scores(gt("rangescore", i32(200)))).toEqual([300, 400, 500])
      expect(await scores(gte("rangescore", i32(200)))).toEqual([200, 300, 400, 500])
      expect(await scores(lt("rangescore", i32(200)))).toEqual([100])
      expect(await scores(lte("rangescore", i32(200)))).toEqual([100, 200])
      expect(await scores(and(gte("rangescore", i32(200)), lte("rangescore", i32(400))))).toEqual([
        200, 300, 400,
      ])
      expect(await scores(or(lt("rangescore", i32(200)), gt("rangescore", i32(400))))).toEqual([
        100, 500,
      ])
      // Inclusive at both ends, like gte AND lte.
      expect(await scores(between("rangescore", i32(200), i32(400)))).toEqual([200, 300, 400])
      expect(await scores(startsWith("label", "score-1"))).toEqual([100])
    },
    { timeout: 60000 },
  )

  test(
    "limit and offset take consecutive windows of a sorted result",
    async () => {
      const value = `paging-${crypto.randomUUID()}`
      const created = await walletClient.executeBatch({
        creates: Array.from({ length: 10 }, () => ({
          schema: Notes,
          values: { tag: value },
          expiration: LIFETIME,
        })),
      })
      await landed(publicClient, created.txHash)

      const where = eq("tag", str(value))
      const sorted = [...created.createdEntities].sort()
      const page = (limit: number, offset: number) =>
        publicClient
          .select({ $key: true })
          .from(Notes)
          .where(where)
          .orderBy(asc("$key"))
          .limit(limit)
          .offset(offset)
          .fetch()

      // 6 then 4, in key order.
      const page1 = await page(6, 0)
      const page2 = await page(6, 6)
      expect(page1.entities.map((e) => e.$key)).toEqual(sorted.slice(0, 6))
      expect(page2.entities.map((e) => e.$key)).toEqual(sorted.slice(6))

      // 5 then 5: a full page can be the last one, which only the page after it shows, by covering
      // fewer matches than its limit. Rows plus skipped, since a schema's misfits count too.
      expect((await page(5, 5)).entities).toHaveLength(5)
      const after = await page(5, 10)
      expect(after.entities.length + after.skipped).toBeLessThan(5)

      // The same pages through the raw form.
      const raw = (offset: number) =>
        publicClient.query(`tag = str('${value}')`, {
          select: { $key: true },
          orderBy: asc("$key"),
          limit: 6,
          offset,
          count: true,
        })
      const raw1 = await raw(0)
      const raw2 = await raw(6)
      expect([...raw1.entities, ...raw2.entities].map((e) => e.$key)).toEqual(sorted)
      // The count is every match, whatever the offset.
      expect(raw2.count).toBe(10n)
    },
    { timeout: 60000 },
  )

  test(
    "a raw query string goes to the node as written",
    async () => {
      const value = `raw-${crypto.randomUUID()}`
      const { entityKey } = await create("http", Notes, { tag: str(value) })
      const queryString = `tag = str('${value}') AND $owner = addr(${account.address})`

      // No selection: full entities.
      const full = await publicClient.query(queryString)
      expect(full.entities.map((e) => e.$key)).toEqual([entityKey])
      expect(full.entities[0]?.$owner).toBe(account.address)
      expect(full.blockNumber).toBeGreaterThan(0n)

      // A selection narrows what the node sends back, raw query or not.
      const projected = await publicClient.query(queryString, { select: { $key: true, tag: true } })
      expect(projected.entities).toEqual([{ $key: entityKey, tag: str(value) }])
    },
    { timeout: 30000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------------------------

  test(
    "every attribute type round-trips as the type it was written with",
    async () => {
      const someone = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
      const entityKey = "0x9f2c000000000000000000000000000000000000000000000000000000000001" as Hex
      const AllTypes = defineSchema({
        numattr: i32().indexed(),
        zeroattr: i32().indexed(),
        bigattr: u64().indexed(),
        amountattr: u256().indexed(),
        decattr: dec().indexed(),
        strattr: str().indexed(),
        boolattr: bool().indexed(),
        addrattr: addr().indexed(),
        keyattr: key().indexed(),
        blobattr: bytes(),
      })

      const created = await walletClient.createEntity(
        AllTypes,
        {
          numattr: i32(42),
          zeroattr: 0,
          bigattr: u64(1_200_000n),
          amountattr: 2n ** 200n,
          decattr: dec("-3.25"),
          strattr: "hello-world",
          boolattr: true,
          addrattr: addr(someone),
          keyattr: key(entityKey),
          blobattr: new Uint8Array([0, 1, 2, 255]),
        },
        { expiration: LIFETIME },
      )
      await landed(publicClient, created.txHash)

      const expected = {
        numattr: i32(42),
        zeroattr: i32(0),
        bigattr: u64(1_200_000n),
        amountattr: u256(2n ** 200n),
        decattr: dec("-3.25"),
        strattr: str("hello-world"),
        boolattr: bool(true),
        addrattr: addr(someone),
        keyattr: key(entityKey),
        blobattr: bytes("0x000102ff"),
      }
      expect((await publicClient.getEntity(created.entityKey)).$attributes).toEqual(expected)
      expect(await publicClient.getEntity(created.entityKey, AllTypes)).toMatchObject(expected)

      // And each indexed one is queryable by the value it holds.
      const found = await publicClient
        .select({ $key: true })
        .from(AllTypes)
        .where(
          and(
            eq("numattr", i32(42)),
            eq("zeroattr", i32(0)),
            eq("bigattr", u64(1_200_000n)),
            eq("amountattr", u256(2n ** 200n)),
            lt("decattr", dec("-3.2")),
            eq("strattr", str("hello-world")),
            eq("boolattr", true),
            eq("addrattr", addr(someone)),
            eq("keyattr", key(entityKey)),
          ),
        )
        .fetch()
      expect(found.entities.map((e) => e.$key)).toEqual([created.entityKey])
    },
    { timeout: 30000 },
  )

  test(
    "an entity is created exactly once, despite the simulation that precedes it",
    async () => {
      const uniqueId = crypto.randomUUID()

      await create("http", Notes, { tag: uniqueId })

      const result = await publicClient
        .select({ $key: true })
        .from(Notes)
        .where(eq("tag", str(uniqueId)))
        .fetch()

      expect(result.entities).toHaveLength(1)
    },
    { timeout: basicCRUDTestTimeout },
  )

  test(
    "the count follows what was created",
    async () => {
      const owned = () => publicClient.count().ownedBy(account.address).fetch()
      const before = await owned()

      const created = await walletClient.executeBatch({
        creates: Array.from({ length: 3 }, () => ({
          schema: Notes,
          values: { body: stringToBytes("counted") },
          expiration: LIFETIME,
        })),
      })
      await landed(publicClient, created.txHash)

      expect(await owned()).toBe(before + 3n)
      const page = await publicClient
        .select({ $key: true })
        .ownedBy(account.address)
        .withCount()
        .limit(1)
        .fetch()
      expect(page.count).toBe(before + 3n)
      expect(page.entities).toHaveLength(1)
    },
    { timeout: 30000 },
  )

  // ---------------------------------------------------------------------------------------------
  // User-defined columns
  // ---------------------------------------------------------------------------------------------

  test(
    "an unindexed column can be selected but not filtered on",
    async () => {
      const group = `unindexed-${crypto.randomUUID()}`
      const Articles = defineSchema({ group: str().indexed(), title: str(), summary: str() })
      const { entityKey } = await create("http", Articles, {
        group,
        title: "Cells, not entities",
        summary: "stored, never indexed",
      })

      const rows = await publicClient
        .select({ $key: true, title: true, summary: true })
        .from(Articles)
        .where(eq("group", group))
        .fetch()
      expect(rows.entities).toEqual([
        {
          $key: entityKey,
          title: str("Cells, not entities"),
          summary: str("stored, never indexed"),
        },
      ])

      // The schema refuses the filter at compile time, and the SDK before the request goes out.
      const byTitle = publicClient.select({ $key: true }).from(Articles)
      // @ts-expect-error title is not indexed
      await expect(byTitle.where(eq("title", "Cells, not entities")).fetch()).rejects.toThrow(
        InvalidPredicateError,
      )

      // A raw query has no schema to stop it. The node has no index to answer it from, so it
      // either refuses the predicate or finds nothing — it never finds the entity.
      const raw = await publicClient
        .query(`group = str('${group}') AND title = str('Cells, not entities')`, {
          select: { $key: true },
        })
        .then((page) => page.entities.map((e) => e.$key))
        .catch(() => [])
      expect(raw).not.toContain(entityKey)

      // And the node reports the attributes as unindexed.
      const shape = await publicClient
        .select({ $attributeSchema: true })
        .where(eq("$key", key(entityKey)))
        .fetch()
      expect(shape.entities[0]?.$attributeSchema).toEqual({
        group: { type: "str", indexed: true },
        title: { type: "str", indexed: false },
        summary: { type: "str", indexed: false },
      })
    },
    { timeout: 30000 },
  )

  test(
    "an entity can carry several bytes columns, empty ones included",
    async () => {
      const Media = defineSchema({
        name: str().indexed(),
        cover: bytes(),
        thumbnail: bytes(),
        empty: bytes(),
        raw: bytes().optional(),
      })
      const cover = new Uint8Array(64 * 1024).map((_, index) => index % 251)
      const name = `media-${crypto.randomUUID()}`
      const { entityKey } = await create("http", Media, {
        name,
        cover,
        thumbnail: bytes("0xcafebabe"),
        empty: new Uint8Array(),
      })

      const media = await publicClient.getEntity(entityKey, Media)
      expect(media.cover).toEqual(bytes(cover))
      expect(media.thumbnail).toEqual(bytes("0xcafebabe"))
      expect(media.empty).toEqual(bytes("0x"))
      expect(media.raw).toBeUndefined()

      // Patching one blob leaves the others alone.
      const { txHash } = await walletClient.patchEntity(Media, entityKey, {
        set: { raw: stringToBytes("raw bytes") },
      })
      await landed(publicClient, txHash)
      const patched = await publicClient.getEntity(entityKey, Media)
      expect(patched.cover).toEqual(bytes(cover))
      expect(patched.raw && hexToString(patched.raw.value)).toBe("raw bytes")
    },
    { timeout: 30000 },
  )

  test(
    "a default is written on create when the column is left out, and only then",
    async () => {
      const group = `defaults-${crypto.randomUUID()}`
      const Docs = defineSchema({
        group: str().indexed(),
        mimeType: str().indexed().default("text/markdown"),
        version: i32().default(1),
      })

      const batch = await walletClient.executeBatch({
        creates: [
          { schema: Docs, values: { group }, expiration: LIFETIME },
          {
            schema: Docs,
            values: { group, mimeType: "text/html", version: 3 },
            expiration: LIFETIME,
          },
        ],
      })
      await landed(publicClient, batch.txHash)
      const [defaulted, explicit] = batch.createdEntities as [Hex, Hex]

      expect(await publicClient.getEntity(defaulted, Docs)).toMatchObject({
        mimeType: str("text/markdown"),
        version: i32(1),
      })
      expect(await publicClient.getEntity(explicit, Docs)).toMatchObject({
        mimeType: str("text/html"),
        version: i32(3),
      })

      // The default is a real, indexed attribute on the node, not something the SDK fills in on read.
      const markdown = await publicClient
        .select({ $key: true })
        .from(Docs)
        .where(eq("group", group), eq("mimeType", "text/markdown"))
        .fetch()
      expect(markdown.entities.map((row) => row.$key)).toEqual([defaulted])
    },
    { timeout: 30000 },
  )

  test(
    "an optional column may be left out, set later, and unset again",
    async () => {
      const group = `optional-${crypto.randomUUID()}`
      const Tasks = defineSchema({
        group: str().indexed(),
        title: str(),
        closedAt: u64().indexed().optional(),
        note: str().optional(),
      })
      const { entityKey } = await create("http", Tasks, { group, title: "write the SDK side" })

      const open = await publicClient.getEntity(entityKey, Tasks)
      expect(open.closedAt).toBeUndefined()
      expect(open.note).toBeUndefined()
      expect(Object.keys((await publicClient.getEntity(entityKey)).$attributes).sort()).toEqual([
        "group",
        "title",
      ])

      const closedOnes = async () =>
        (
          await publicClient
            .select({ $key: true })
            .from(Tasks)
            .where(eq("group", group), exists("closedAt"))
            .fetch()
        ).entities.map((row) => row.$key)
      expect(await closedOnes()).toEqual([])

      const close = await walletClient.patchEntity(Tasks, entityKey, {
        set: { closedAt: u64(await publicClient.getBlockNumber()), note: "done" },
      })
      await landed(publicClient, close.txHash)
      const closed = await publicClient.getEntity(entityKey, Tasks)
      expect(closed.closedAt?.type).toBe("u64")
      expect(closed.note).toEqual(str("done"))
      expect(await closedOnes()).toEqual([entityKey])

      const reopen = await walletClient.patchEntity(Tasks, entityKey, {
        unset: ["closedAt", "note"],
      })
      await landed(publicClient, reopen.txHash)
      const reopened = await publicClient.getEntity(entityKey, Tasks)
      expect(reopened.closedAt).toBeUndefined()
      expect(reopened.note).toBeUndefined()
      expect(reopened.title).toEqual(str("write the SDK side"))
      expect(await closedOnes()).toEqual([])
    },
    { timeout: 30000 },
  )

  test(
    "a patch can flip a column between indexed and unindexed",
    async () => {
      const group = `flip-${crypto.randomUUID()}`
      // Two versions of one schema: `rank` starts out stored only, and the second version indexes it.
      const RankedV1 = defineSchema({ group: str().indexed(), rank: i32() })
      const RankedV2 = defineSchema({ group: str().indexed(), rank: i32().indexed() })
      const { entityKey } = await create("http", RankedV1, { group, rank: 1 })

      const byRank = async () =>
        await publicClient
          .select({ $key: true })
          .from(RankedV2)
          .where(eq("group", group), eq("rank", 1))
          .fetch()
          .then((page) => page.entities.map((row) => row.$key))
          .catch(() => [])
      expect(await byRank()).not.toContain(entityKey)

      // Writing the column through the new version writes it with the indexed flag.
      const { txHash } = await walletClient.patchEntity(RankedV2, entityKey, { set: { rank: 1 } })
      await landed(publicClient, txHash)
      expect(await byRank()).toEqual([entityKey])
      const shape = await publicClient
        .select({ $attributeSchema: true })
        .where(eq("$key", key(entityKey)))
        .fetch()
      expect(shape.entities[0]?.$attributeSchema.rank).toEqual({
        type: "i32",
        indexed: true,
      })

      // And back: the old version writes it unindexed again.
      const { txHash: back } = await walletClient.patchEntity(RankedV1, entityKey, {
        set: { rank: 1 },
      })
      await landed(publicClient, back)
      expect(await byRank()).not.toContain(entityKey)
    },
    { timeout: 30000 },
  )

  test(
    "the SDK holds writes and reads to their schema",
    async () => {
      const group = `checks-${crypto.randomUUID()}`
      const Strict = defineSchema({ group: str().indexed(), score: dec().indexed() })

      // A write that does not fit its schema never leaves the SDK.
      await expect(
        // @ts-expect-error a bare string is a str, not a dec
        walletClient.createEntity(Strict, { group, score: "4.1" }, { expiration: LIFETIME }),
      ).rejects.toThrow(SchemaMismatchError)
      await expect(
        // @ts-expect-error score is required
        walletClient.createEntity(Strict, { group }, { expiration: LIFETIME }),
      ).rejects.toThrow(SchemaMismatchError)

      // An entity read through a schema it does not fit is reported, not silently mistyped.
      const { entityKey } = await create("http", Strict, { group, score: dec("4.1") })
      const Mistyped = defineSchema({ group: str().indexed(), score: i32().indexed() })
      await expect(publicClient.getEntity(entityKey, Mistyped)).rejects.toThrow(SchemaMismatchError)
      const Wider = defineSchema({ group: str().indexed(), score: dec(), extra: str() })
      await expect(publicClient.getEntity(entityKey, Wider)).rejects.toThrow(SchemaMismatchError)
    },
    { timeout: 30000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------------------------

  test.each(transports)(
    "every operation reaches the handler for its event over %s",
    async (transport) => {
      const { read, write } = clients(transport)

      const seed = await write.executeBatch({
        creates: Array.from({ length: 3 }, () => ({
          schema: Notes,
          values: { body: stringToBytes("seed") },
          expiration: LIFETIME,
        })),
      })
      await landed(read, seed.txHash)
      const [toPatch, toDelete, toTransfer] = seed.createdEntities as [Hex, Hex, Hex]

      const events: EntityEvent[] = []
      const perHandler: string[] = []
      const errors: Error[] = []
      const unwatch = read.watchEntityEvents({
        onEvent: (event) => events.push(event),
        onEntityCreated: ({ entityKey }) => perHandler.push(`created:${entityKey}`),
        onEntityPatched: ({ entityKey }) => perHandler.push(`patched:${entityKey}`),
        onExpiryExtended: ({ entityKey }) => perHandler.push(`extended:${entityKey}`),
        onOwnershipTransferred: ({ entityKey }) => perHandler.push(`transferred:${entityKey}`),
        onEntityDeleted: ({ entityKey }) => perHandler.push(`deleted:${entityKey}`),
        onError: (error) => errors.push(error),
      })

      try {
        // Let the watcher's first poll set up its filter, or these writes may land before it.
        await new Promise((r) => setTimeout(r, 3_000))
        const batch = await write.executeBatch({
          creates: [
            {
              schema: Notes,
              values: { body: stringToBytes("created under watch") },
              expiration: LIFETIME,
            },
          ],
          patches: [{ schema: Notes, entityKey: toPatch, set: { tag: str("watched") } }],
          deletes: [{ entityKey: toDelete }],
          extensions: [{ entityKey: toPatch, expiration: ExpirationTime.fromBlocks(20_000) }],
          ownershipChanges: [{ entityKey: toTransfer, newOwner: SOMEONE_ELSE }],
        })
        const receipt = await landed(read, batch.txHash)
        const created = batch.createdEntities[0] as Hex

        expect(await eventually(() => events.length >= 5)).toBe(true)
        await new Promise((resolve) => setTimeout(resolve, 1500))

        // In application order — which is the batch's order, and the order the SDK sends the
        // operations in: creates, patches, deletes, extensions, transfers.
        expect(events.map((event) => `${event.type}:${event.entityKey}`)).toEqual([
          `EntityCreated:${created}`,
          `EntityPatched:${toPatch}`,
          `EntityDeleted:${toDelete}`,
          `ExpiryExtended:${toPatch}`,
          `OwnershipTransferred:${toTransfer}`,
        ])
        expect(perHandler).toEqual([
          `created:${created}`,
          `patched:${toPatch}`,
          `deleted:${toDelete}`,
          `extended:${toPatch}`,
          `transferred:${toTransfer}`,
        ])

        // Every event carries where it came from, and they arrived in that order.
        for (const event of events) {
          expect(event.blockNumber).toBe(receipt.blockNumber)
          expect(event.transactionHash).toBe(receipt.transactionHash)
        }
        const logIndexes = events.map((event) => event.logIndex)
        expect(logIndexes).toEqual([...logIndexes].sort((a, b) => a - b))

        // The typed payloads each event type carries.
        const createdEvent = events[0]
        if (createdEvent?.type !== "EntityCreated") throw new Error("expected a create first")
        expect(createdEvent.owner).toBe(account.address)
        expect(createdEvent.expiresAt).toBeGreaterThan(receipt.blockNumber)
        expect(createdEvent.creationFlags).toEqual({
          readonly: false,
          permissionlessExtension: false,
          raw: 0,
        })

        const transferEvent = events[4]
        if (transferEvent?.type !== "OwnershipTransferred") throw new Error("expected a transfer")
        expect(transferEvent.previousOwner).toBe(account.address)
        expect(transferEvent.newOwner).toBe(SOMEONE_ELSE)

        expect(errors).toEqual([])
      } finally {
        unwatch()
      }
    },
    { timeout: 60000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Key derivation
  // ---------------------------------------------------------------------------------------------

  test(
    "the SDK derives the same entity key the engine does",
    async () => {
      const newcomer = privateKeyToAccount(generatePrivateKey())
      const funding = await walletClient.sendTransaction({
        account,
        chain: walletClient.chain,
        to: newcomer.address,
        value: parseEther("0.1"),
      })
      await landed(publicClient, funding)

      const newcomerClient = createWalletClient({
        transport: http(httpUrl),
        chain: walletClient.chain,
        account: newcomer,
      })

      const { entityKey, txHash } = await newcomerClient.createEntity(
        Notes,
        { body: stringToBytes("first") },
        { expiration: LIFETIME, salt: 42n },
      )
      await landed(publicClient, txHash)

      expect(entityKey).toBe(
        predictEntityKey({ owner: newcomer.address, nonce: 0n, salt: 42n, chainId }),
      )
      // And the entity is really there under that key.
      expect((await publicClient.getEntity(entityKey)).$owner).toBe(newcomer.address)

      // The nonce the engine keeps for it moved by exactly that one create.
      expect(await publicClient.getEntityNonce(newcomer.address)).toBe(1n)
      // An account that has never created anything is 0 rather than an error.
      expect(await publicClient.getEntityNonce(SOMEONE_ELSE)).toBe(0n)
    },
    { timeout: 30000 },
  )

  test(
    "the keys a batch will mint can be worked out before it is sent",
    async () => {
      const group = `predicted-${crypto.randomUUID()}`
      const Tree = defineSchema({
        predictgroup: str().indexed(),
        role: str().indexed(),
        parent: key().indexed().optional(),
      })
      const nonceBefore = await publicClient.getEntityNonce(account.address)
      expect(nonceBefore).toBeGreaterThan(0n)

      const [parent, child] = await publicClient.predictEntityKeys({
        owner: account.address,
        count: 2,
      })
      expect(parent.key).not.toBe(child.key)

      const batch = await walletClient.executeBatch({
        creates: [
          {
            schema: Tree,
            values: { predictgroup: str(group), role: str("parent") },
            expiration: LIFETIME,
            salt: parent.salt,
          },
          {
            schema: Tree,
            values: { predictgroup: str(group), role: str("child"), parent: key(parent.key) },
            expiration: LIFETIME,
            salt: child.salt,
          },
        ],
      })
      await landed(publicClient, batch.txHash)

      expect(batch.createdEntities).toEqual([parent.key, child.key])
      expect((await publicClient.getEntity(parent.key, Tree)).role).toEqual(str("parent"))

      const children = await publicClient
        .select({ $key: true, parent: true })
        .from(Tree)
        .where(and(eq("predictgroup", str(group)), eq("role", str("child"))))
        .fetch()
      expect(children.entities.map((row) => row.$key)).toEqual([child.key])
      expect(children.entities.map((row) => row.parent)).toEqual([key(parent.key)])

      // Two creates, two nonces.
      expect(await publicClient.getEntityNonce(account.address)).toBe(nonceBefore + 2n)
    },
    { timeout: 30000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Expiry.
  // ---------------------------------------------------------------------------------------------

  test(
    "an entity stops existing when its expiry block arrives",
    async () => {
      const value = `expiry-${crypto.randomUUID()}`
      const { entityKey, expiresAt, blockNumber } = await create(
        "http",
        Notes,
        { tag: str(value) },
        { expiration: ExpirationTime.fromBlocks(20) },
      )

      expect(expiresAt).toBeGreaterThan(blockNumber)

      // Wait out the lifetime. 20 blocks is seconds on a dev node and under a minute anywhere.
      const gone = await eventually(
        async () => (await publicClient.getBlockNumber()) > expiresAt,
        60_000,
      )
      expect(gone).toBe(true)

      await expect(publicClient.getEntity(entityKey)).rejects.toThrow(NoEntityFoundError)
      const live = await publicClient
        .select({ $key: true })
        .from(Notes)
        .where(eq("tag", str(value)))
        .fetch()
      expect(live.entities).toHaveLength(0)
    },
    { timeout: 90000 },
  )
})
