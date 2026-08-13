import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { EntityEvent, PublicArkivClient, WalletArkivClient } from "@arkiv-network/sdk"
import {
  createPublicClient,
  createWalletClient,
  EntityMutationError,
  ExpirationTime,
  jsonToPayload,
  MAX_EXPIRES_AT,
  NoEntityFoundError,
  predictEntityKey,
  stringToPayload,
} from "@arkiv-network/sdk"
import { addr, bool, bytes32, i32, key, str, u64 } from "@arkiv-network/sdk/attr"
import { and, eq, gt, gte, lt, lte, not, or, startsWith } from "@arkiv-network/sdk/query"
import type { StartedTestContainer } from "testcontainers"
import { checksumAddress, type Hex, http, parseEther, toBytes, webSocket } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { execCommand, launchLocalArkivNode } from "./utils.js"

const basicCRUDTestTimeout: number = parseInt(process.env.ARKIV_SDK_TEST_CRUD_TIMEOUT || "30000")

const usesContainer = !(process.env.ARKIV_SDK_TEST_RPC_URL || process.env.ARKIV_SDK_TEST_WS_URL)

type TransportName = "http" | "webSocket"
const transports: TransportName[] = ["http", "webSocket"]

/** A lifetime long enough to outlive any test here. */
const LIFETIME = ExpirationTime.fromBlocks(10_000)

const SOMEONE_ELSE = checksumAddress("0x1231231231231231231231231231231231231231")

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

  async function createEntityForTest(
    transport: TransportName,
    options: { payload?: string; attribute?: { name: string; value: string } } = {},
  ) {
    const payload = options.payload ?? "Hello world"

    if (arkivNode) {
      const command = [
        "arkiv-cli",
        "--private-key",
        privateKey,
        "create",
        "--payload",
        payload,
        "--content-type",
        "text/plain",
        "--min-lifetime",
        "10000",
      ]

      if (options.attribute) {
        command.push("--attributes", `${options.attribute.name}:string=${options.attribute.value}`)
      }

      const result = await execCommand(arkivNode, command)
      const match = result.match(/entity_key:(.*)/)
      if (!match || !match[1]) {
        throw new Error(
          `Failed to parse entity key from CLI output. Expected format "entity_key: <hex>". Actual output:\n${result}`,
        )
      }
      return match[1].trim() as Hex
    }

    const { entityKey } = await clients(transport).write.createEntity({
      payload: toBytes(payload),
      contentType: "text/plain",
      attributes: options.attribute ? { [options.attribute.name]: options.attribute.value } : {},
      expires: LIFETIME,
    })

    return entityKey
  }

  /** Creates one entity through the SDK and waits for it to land. */
  async function create(
    transport: TransportName,
    attributes: Parameters<WalletArkivClient["createEntity"]>[0]["attributes"],
    options: { payload?: Uint8Array; flags?: { readonly?: boolean } } = {},
  ) {
    const { read, write } = clients(transport)
    const created = await write.createEntity({
      payload: options.payload ?? jsonToPayload({ entity: { entityType: "test" } }),
      contentType: "application/json",
      attributes,
      expires: LIFETIME,
      ...(options.flags ? { flags: options.flags } : {}),
    })
    const receipt = await read.waitForTransactionReceipt({ hash: created.txHash })
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

      expect(entity.key).toBe(testKey)
      expect(entity.toText()).toBe("Hello world")
      expect(entity.contentType).toBe("text/plain")
      expect(entity.attributes).toBeDefined()
      expect(entity.owner).toBe(account.address)
      expect(entity.creator).toBe(account.address)
      expect(entity.expiresAt).toBeGreaterThan(entity.createdAt)
      expect(entity.createdAt).toBeGreaterThan(0n)
      expect(entity.updatedAt).toBe(entity.createdAt)
      expect(entity.creationFlags).toEqual({
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
  })

  // ---------------------------------------------------------------------------------------------
  // The entity lifecycle
  // ---------------------------------------------------------------------------------------------

  test.each(transports)(
    "an entity is created, patched, extended and deleted over %s",
    async (transport) => {
      const { read, write } = clients(transport)

      const payload = jsonToPayload({ entity: { entityType: "test", entityId: "test" } })
      const { entityKey, txHash, expiresAt } = await write.createEntity({
        payload,
        contentType: "application/json",
        attributes: { testkey: "testValue", keeper: i32(7) },
        expires: LIFETIME,
      })
      await read.waitForTransactionReceipt({ hash: txHash })

      const entity = await read.getEntity(entityKey)
      expect(entity.payload).toEqual(payload)
      expect(entity.attributes.testkey).toEqual(str("testValue"))
      expect(entity.expiresAt).toBe(expiresAt)

      // Patch: new contents, one attribute set, one unset — and `keeper` left alone
      const updatedPayload = jsonToPayload({ entity: { entityType: "test2", entityId: "test2" } })
      const { entityKey: patchedKey, txHash: patchedTx } = await write.patchEntity({
        entityKey,
        payload: updatedPayload,
        contentType: "text/plain",
        set: { added: str("new") },
        unset: ["testkey"],
      })
      await read.waitForTransactionReceipt({ hash: patchedTx })
      expect(patchedKey).toBe(entityKey)

      const patched = await read.getEntity(entityKey)
      expect(patched.payload).toEqual(updatedPayload)
      expect(patched.contentType).toBe("text/plain")
      expect(patched.attributes).toEqual({ added: str("new"), keeper: i32(7) })
      expect(patched.updatedAt).toBeGreaterThan(patched.createdAt)

      const { txHash: extendedTx, expiresAt: extendedExpiresAt } = await write.extendEntity({
        entityKey,
        expires: ExpirationTime.fromBlocks(20_000),
      })
      await read.waitForTransactionReceipt({ hash: extendedTx })
      expect(extendedExpiresAt).toBeGreaterThan(expiresAt)
      expect((await read.getEntity(entityKey)).expiresAt).toBe(extendedExpiresAt)

      // Delete.
      const { txHash: deletedTx } = await write.deleteEntity({ entityKey })
      await read.waitForTransactionReceipt({ hash: deletedTx })
      await expect(read.getEntity(entityKey)).rejects.toThrow(NoEntityFoundError)
    },
    { timeout: basicCRUDTestTimeout },
  )

  test(
    "transferring an entity moves it to the new owner and keeps its creator",
    async () => {
      const { entityKey } = await create("http", { testkey: "testValue" })

      const { entityKey: changedKey, txHash } = await walletClient.changeOwnership({
        entityKey,
        newOwner: SOMEONE_ELSE,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      expect(changedKey).toBe(entityKey)

      const entity = await publicClient.getEntity(entityKey)
      expect(entity.owner).toBe(SOMEONE_ELSE)
      // The creator is fixed at creation and survives a transfer.
      expect(entity.creator).toBe(account.address)

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
        { flagged: str("yes") },
        { flags: { readonly: true } },
      )

      const entity = await publicClient.getEntity(entityKey)
      expect(entity.creationFlags).toEqual({
        readonly: true,
        permissionlessExtension: false,
        raw: 1,
      })

      await expect(
        walletClient.patchEntity({ entityKey, set: { flagged: str("no") } }),
      ).rejects.toThrow(/readonly/)
      const { txHash } = await walletClient.extendEntity({
        entityKey,
        expires: ExpirationTime.fromBlocks(20_000),
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
    },
    { timeout: 20000 },
  )

  test(
    "a permanent entity expires at a block no chain will reach",
    async () => {
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: stringToPayload("forever"),
        contentType: "text/plain",
        expires: ExpirationTime.permanent(),
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      expect((await publicClient.getEntity(entityKey)).expiresAt).toBe(MAX_EXPIRES_AT)
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
      const seed = await walletClient.mutateEntities({
        creates: Array.from({ length: 5 }, () => ({
          payload: jsonToPayload({ entity: { entityType: "test", entityId: "test" } }),
          contentType: "application/json" as const,
          attributes: { testkey: "testValue" },
          expires: LIFETIME,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: seed.txHash })

      const [toPatch, toDeleteA, toDeleteB, toExtend, toTransfer] = seed.createdEntities
      if (!toPatch || !toDeleteA || !toDeleteB || !toExtend || !toTransfer) {
        throw new Error(`expected 5 seeded keys, got ${seed.createdEntities.length}`)
      }

      const result = await walletClient.mutateEntities({
        creates: [
          {
            payload: jsonToPayload({ entity: { entityType: "test", entityId: "test" } }),
            contentType: "application/json",
            attributes: { testkey: "testValue" },
            expires: LIFETIME,
          },
        ],
        patches: [
          {
            entityKey: toPatch,
            payload: jsonToPayload({ entity: { entityType: "test", entityId: "patched" } }),
            contentType: "application/json",
            set: { testkey: "patchedValue" },
          },
        ],
        deletes: [{ entityKey: toDeleteA }, { entityKey: toDeleteB }],
        extensions: [{ entityKey: toExtend, expires: ExpirationTime.fromBlocks(20_000) }],
        ownershipChanges: [{ entityKey: toTransfer, newOwner: SOMEONE_ELSE }],
      })
      await publicClient.waitForTransactionReceipt({ hash: result.txHash })

      expect(result.createdEntities).toHaveLength(1)
      expect(result.patchedEntities).toEqual([toPatch])
      expect(result.deletedEntities).toEqual([toDeleteA, toDeleteB])
      expect(result.extendedEntities).toEqual([toExtend])
      expect(result.ownershipChanges).toEqual([toTransfer])

      // The returned lists say what was asked for; the chain says what happened.
      expect((await publicClient.getEntity(toPatch)).attributes.testkey).toEqual(
        str("patchedValue"),
      )
      await expect(publicClient.getEntity(toDeleteA)).rejects.toThrow(NoEntityFoundError)
      await expect(publicClient.getEntity(toDeleteB)).rejects.toThrow(NoEntityFoundError)
      expect((await publicClient.getEntity(toTransfer)).owner).toBe(SOMEONE_ELSE)
    },
    { timeout: 60000 },
  )

  test(
    "a batch that cannot apply in full applies none of it",
    async () => {
      const ghost = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex
      const marker = `atomic-${crypto.randomUUID()}`

      // One good create, one impossible delete. The create must not survive the batch.
      await expect(
        walletClient.mutateEntities({
          creates: [
            {
              payload: stringToPayload("should never exist"),
              contentType: "text/plain",
              attributes: { atomicmarker: marker },
              expires: LIFETIME,
            },
          ],
          deletes: [{ entityKey: ghost }],
        }),
      ).rejects.toThrow(EntityMutationError)

      const survivors = await publicClient
        .select({ key: true })
        .where(eq("atomicmarker", str(marker)))
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
        () => walletClient.patchEntity({ entityKey: ghost, set: { a: str("x") } }),
        () => walletClient.deleteEntity({ entityKey: ghost }),
        () => walletClient.extendEntity({ entityKey: ghost, expires: LIFETIME }),
      ]) {
        await expect(operation()).rejects.toThrow(/no entity 0x11111111/)
      }

      // An extension that would shorten the entity's life is refused by the node
      const { entityKey } = await create("http", { shortener: str("no") })
      const soon = ExpirationTime.atBlock((await publicClient.getBlockNumber()) + 5n)
      await expect(walletClient.extendEntity({ entityKey, expires: soon })).rejects.toThrow(
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
      const { entityKey } = await create("http", { name: str(value) })
      const matches = eq("name", str(value))

      const byAttribute = await publicClient.select({ key: true }).where(matches).fetch()
      expect(byAttribute.entities.map((e) => e.key)).toEqual([entityKey])

      const byOwner = await publicClient
        .select({ key: true })
        .where(matches)
        .ownedBy(account.address)
        .fetch()
      expect(byOwner.entities).toHaveLength(1)

      const byCreator = await publicClient
        .select({ key: true })
        .where(matches)
        .createdBy(account.address)
        .fetch()
      expect(byCreator.entities).toHaveLength(1)

      const byBoth = await publicClient
        .select({ key: true })
        .where(matches)
        .ownedBy(account.address)
        .createdBy(account.address)
        .fetch()
      expect(byBoth.entities).toHaveLength(1)

      const byStranger = await publicClient
        .select({ key: true })
        .where(matches)
        .createdBy("0x0000000000000000000000000000000000000000")
        .fetch()
      expect(byStranger.entities).toHaveLength(0)

      const byKey = await publicClient
        .select({ key: true })
        .where(eq("$key", key(entityKey)))
        .fetch()
      expect(byKey.entities.map((e) => e.key)).toEqual([entityKey])
    },
    { timeout: 30000 },
  )

  test(
    "a projection returns exactly the fields it asked for",
    async () => {
      const value = `projection-${crypto.randomUUID()}`
      await create("http", { testkey: str(value) })
      const where = eq("testkey", str(value))

      // key only — the result type is narrowed to exactly { key }, and the RPC must actually omit
      // the rest rather than merely typing it away. That over-fetch guarantee is what select()
      // exists for, so it is asserted at runtime too.
      const keyOnly = await publicClient.select({ key: true }).where(where).fetch()
      expect(keyOnly.entities[0]?.key).toBeDefined()
      // @ts-expect-error owner was not selected
      expect(keyOnly.entities[0]?.owner).toBeUndefined()
      // @ts-expect-error attributes were not selected
      expect(keyOnly.entities[0]?.attributes).toBeUndefined()
      // @ts-expect-error payload was not selected
      expect(keyOnly.entities[0]?.payload).toBeUndefined()
      // @ts-expect-error contentType was not selected
      expect(keyOnly.entities[0]?.contentType).toBeUndefined()
      // @ts-expect-error creator was not selected
      expect(keyOnly.entities[0]?.creator).toBeUndefined()
      // @ts-expect-error expiresAt was not selected
      expect(keyOnly.entities[0]?.expiresAt).toBeUndefined()
      // @ts-expect-error createdAt was not selected
      expect(keyOnly.entities[0]?.createdAt).toBeUndefined()
      // @ts-expect-error updatedAt was not selected
      expect(keyOnly.entities[0]?.updatedAt).toBeUndefined()

      // payload only — toText()/toJson() appear on the type only when payload was selected
      const payloadOnly = await publicClient.select({ payload: true }).where(where).fetch()
      expect(payloadOnly.entities[0]?.payload.length).toBeGreaterThan(0)
      expect(payloadOnly.entities[0]?.toJson()).toMatchObject({ entity: { entityType: "test" } })

      const metadataOnly = await publicClient.select({
        owner: true,
        creator: true,
        contentType: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        creationFlags: true,
      }).where(where).fetch()
      expect(metadataOnly.entities[0]?.owner).toBe(account.address)
      expect(metadataOnly.entities[0]?.creator).toBe(account.address)
      expect(metadataOnly.entities[0]?.contentType).toBe("application/json")
      expect(metadataOnly.entities[0]?.expiresAt).toBeGreaterThan(0n)
      expect(metadataOnly.entities[0]?.createdAt).toBeGreaterThan(0n)
      expect(metadataOnly.entities[0]?.updatedAt).toBeGreaterThan(0n)
      expect(metadataOnly.entities[0]?.creationFlags.raw).toBe(0)
      // @ts-expect-error attributes were not selected
      expect(metadataOnly.entities[0]?.attributes).toBeUndefined()

      const attributesOnly = await publicClient.select({ attributes: true }).where(where).fetch()
      expect(attributesOnly.entities[0]?.attributes.testkey).toEqual(str(value))
      // @ts-expect-error key was not selected
      expect(attributesOnly.entities[0]?.key).toBeUndefined()

      // The schema projection names the types without paying for the values.
      const schemaOnly = await publicClient.select({ attributeSchema: true }).where(where).fetch()
      expect(schemaOnly.entities[0]?.attributeSchema).toEqual({ testkey: "str" })

      // Attributes can be narrowed to just the names you want.
      const oneAttribute = await publicClient
        .select({ key: true, attributes: { testkey: true } })
        .where(where)
        .fetch()
      expect(oneAttribute.entities[0]?.attributes).toEqual({ testkey: str(value) })

      // No selection at all is every field.
      const everything = await publicClient.select().where(where).fetch()
      expect(everything.entities[0]?.key).toBeDefined()
      expect(everything.entities[0]?.owner).toBe(account.address)
      expect(everything.entities[0]?.attributes.testkey).toEqual(str(value))
      expect(everything.entities[0]?.payload.length).toBeGreaterThan(0)
    },
    { timeout: 30000 },
  )

  test(
    "the operators the engine supports filter as written",
    async () => {
      const group = `operators-${crypto.randomUUID()}`
      const created = await walletClient.mutateEntities({
        creates: [100, 200, 300, 400, 500].map((score) => ({
          payload: jsonToPayload({ entity: { entityType: "rangetest", entityId: `s-${score}` } }),
          contentType: "application/json" as const,
          attributes: { rangegroup: group, rangescore: i32(score), label: str(`score-${score}`) },
          expires: LIFETIME,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("rangegroup", str(group))
      const scores = async (predicate: Parameters<typeof and>[0]) => {
        const page = await publicClient
          .select({ attributes: { rangescore: true } })
          .where(and(inGroup, predicate))
          .fetch()
        return page.entities
          .map((e) => Number(e.attributes.rangescore?.value))
          .sort((a, b) => a - b)
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
      expect(await scores(not(eq("rangescore", i32(100))))).toEqual([200, 300, 400, 500])
      expect(await scores(startsWith("label", "score-1"))).toEqual([100])
    },
    { timeout: 60000 },
  )

  test(
    "a large result set pages without losing or repeating anything",
    async () => {
      const value = `paging-${crypto.randomUUID()}`
      const created = await walletClient.mutateEntities({
        creates: Array.from({ length: 10 }, () => ({
          payload: jsonToPayload({ entity: { entityType: "test", entityId: "test" } }),
          contentType: "application/json" as const,
          attributes: { testkey: value },
          expires: LIFETIME,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const where = eq("testkey", str(value))

      // 6 then 4. `next()` returns a new page rather than mutating this one.
      const page1 = await publicClient.select({ key: true }).where(where).limit(6).fetch()
      expect(page1.entities).toHaveLength(6)
      expect(page1.hasNextPage()).toBe(true)

      const page2 = await page1.next()
      expect(page2.entities).toHaveLength(4)
      expect(page2.hasNextPage()).toBe(false)
      await expect(page2.next()).rejects.toThrow()

      // 5 then 5 — a full final page is still reported as the last one, because the node omits
      // the cursor rather than leaving it to be guessed from a short page.
      const evenPage1 = await publicClient.select({ key: true }).where(where).limit(5).fetch()
      expect(evenPage1.entities).toHaveLength(5)
      expect(evenPage1.hasNextPage()).toBe(true)

      const evenPage2 = await evenPage1.next()
      expect(evenPage2.entities).toHaveLength(5)
      expect(evenPage2.hasNextPage()).toBe(false)

      const keys = [...evenPage1.entities, ...evenPage2.entities].map((e) => e.key)
      expect(new Set(keys).size).toBe(10)

      // The same walk through the raw form, which takes the cursor by hand.
      const raw1 = await publicClient.query(`testkey = str('${value}')`, {
        select: { key: true },
        limit: 6,
      })
      expect(raw1.entities).toHaveLength(6)
      expect(raw1.cursor).toBeDefined()
      const raw2 = await publicClient.query(`testkey = str('${value}')`, {
        select: { key: true },
        limit: 6,
        cursor: raw1.cursor,
      })
      expect(raw2.entities).toHaveLength(4)
      expect(raw2.cursor).toBeUndefined()
      expect(new Set([...raw1.entities, ...raw2.entities].map((e) => e.key)).size).toBe(10)
    },
    { timeout: 60000 },
  )

  test(
    "a raw query string goes to the node as written",
    async () => {
      const value = `raw-${crypto.randomUUID()}`
      const { entityKey } = await create("http", { name: str(value) })
      const queryString = `name = str('${value}') AND $owner = addr(${account.address})`

      // No selection: full entities.
      const full = await publicClient.query(queryString)
      expect(full.entities.map((e) => e.key)).toEqual([entityKey])
      expect(full.entities[0]?.owner).toBe(account.address)
      expect(full.blockNumber).toBeGreaterThan(0n)
      expect(full.cursor).toBeUndefined()

      // A selection narrows what the node sends back, raw query or not.
      const projected = await publicClient.query(queryString, { select: { key: true } })
      expect(projected.entities[0]?.key).toBe(entityKey)
      expect(projected.entities[0]?.owner).toBeUndefined()
      expect(projected.entities[0]?.payload).toBeUndefined()
      expect(projected.entities[0]?.contentType).toBeUndefined()
    },
    { timeout: 30000 },
  )

  test(
    "a query reads the state a past block had",
    async () => {
      const value = `history-${crypto.randomUUID()}`
      const { entityKey, blockNumber: createdAt } = await create("http", {
        historygroup: str(value),
        version: i32(1),
      })

      const { txHash } = await walletClient.patchEntity({
        entityKey,
        set: { version: i32(2) },
      })
      const { blockNumber: patchedAt } = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      })

      const at = async (block: bigint) => {
        const page = await publicClient
          .select({ attributes: { version: true } })
          .where(eq("historygroup", str(value)))
          .atBlock(block)
          .fetch()
        return { block: page.blockNumber, versions: page.entities.map((e) => e.attributes.version) }
      }

      // Before the entity existed, at the block it was created in, and after the patch.
      expect(await at(createdAt - 1n)).toEqual({ block: createdAt - 1n, versions: [] })
      expect(await at(createdAt)).toEqual({ block: createdAt, versions: [i32(1)] })
      expect(await at(patchedAt)).toEqual({ block: patchedAt, versions: [i32(2)] })
    },
    { timeout: 30000 },
  )

  // ---------------------------------------------------------------------------------------------
  // Attributes
  // ---------------------------------------------------------------------------------------------

  test(
    "every attribute type round-trips as the type it was written with",
    async () => {
      const digest = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Hex
      const someone = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
      const entityKey = "0x9f2c000000000000000000000000000000000000000000000000000000000001" as Hex

      const created = await walletClient.createEntity({
        payload: jsonToPayload({ test: "all-attr-types" }),
        contentType: "application/json",
        attributes: {
          digestattr: bytes32(digest),
          numattr: i32(42),
          zeroattr: i32(0),
          bigattr: u64(1_200_000n),
          strattr: "hello-world",
          boolattr: true,
          addrattr: addr(someone),
          keyattr: key(entityKey),
        },
        expires: LIFETIME,
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const entity = await publicClient.getEntity(created.entityKey)

      expect(entity.attributes).toEqual({
        digestattr: bytes32(digest),
        numattr: i32(42),
        zeroattr: i32(0),
        bigattr: u64(1_200_000n),
        strattr: str("hello-world"),
        boolattr: bool(true),
        addrattr: addr(someone),
        keyattr: key(entityKey),
      })

      // And each one is queryable by the value it holds.
      const found = await publicClient
        .select({ key: true })
        .where(
          and(
            eq("digestattr", bytes32(digest)),
            eq("numattr", i32(42)),
            eq("zeroattr", i32(0)),
            eq("bigattr", u64(1_200_000n)),
            eq("strattr", str("hello-world")),
            eq("boolattr", true),
            eq("addrattr", addr(someone)),
            eq("keyattr", key(entityKey)),
          ),
        )
        .fetch()
      expect(found.entities.map((e) => e.key)).toEqual([created.entityKey])
    },
    { timeout: 30000 },
  )

  test(
    "an entity is created exactly once, despite the simulation that precedes it",
    async () => {
      const uniqueId = crypto.randomUUID()

      const { txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ entity: { entityType: "dedupetest", entityId: uniqueId } }),
        contentType: "application/json",
        attributes: { dedupeid: uniqueId },
        expires: LIFETIME,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const result = await publicClient
        .select({ key: true })
        .where(eq("dedupeid", str(uniqueId)))
        .fetch()

      expect(result.entities).toHaveLength(1)
    },
    { timeout: basicCRUDTestTimeout },
  )

  test(
    "the entity count follows what was created",
    async () => {
      const before = await publicClient.getEntityCount()

      const created = await walletClient.mutateEntities({
        creates: Array.from({ length: 3 }, () => ({
          payload: stringToPayload("counted"),
          contentType: "text/plain" as const,
          expires: LIFETIME,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      expect(await publicClient.getEntityCount()).toBe(before + 3)
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

      const seed = await write.mutateEntities({
        creates: Array.from({ length: 3 }, () => ({
          payload: stringToPayload("seed"),
          contentType: "text/plain" as const,
          expires: LIFETIME,
        })),
      })
      await read.waitForTransactionReceipt({ hash: seed.txHash })
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
        const batch = await write.mutateEntities({
          creates: [
            {
              payload: stringToPayload("created under watch"),
              contentType: "text/plain",
              expires: LIFETIME,
            },
          ],
          patches: [{ entityKey: toPatch, set: { watched: str("yes") } }],
          deletes: [{ entityKey: toDelete }],
          extensions: [{ entityKey: toPatch, expires: ExpirationTime.fromBlocks(20_000) }],
          ownershipChanges: [{ entityKey: toTransfer, newOwner: SOMEONE_ELSE }],
        })
        const receipt = await read.waitForTransactionReceipt({ hash: batch.txHash })
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
      await publicClient.waitForTransactionReceipt({ hash: funding })

      const newcomerClient = createWalletClient({
        transport: http(httpUrl),
        chain: walletClient.chain,
        account: newcomer,
      })

      const { entityKey, txHash } = await newcomerClient.createEntity({
        payload: stringToPayload("first"),
        contentType: "text/plain",
        expires: LIFETIME,
        salt: 42n,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      expect(entityKey).toBe(
        predictEntityKey({ owner: newcomer.address, nonce: 0n, salt: 42n, chainId }),
      )
      // And the entity is really there under that key.
      expect((await publicClient.getEntity(entityKey)).owner).toBe(newcomer.address)

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
      const nonceBefore = await publicClient.getEntityNonce(account.address)
      expect(nonceBefore).toBeGreaterThan(0n)

      const [parent, child] = await publicClient.predictEntityKeys({
        owner: account.address,
        count: 2,
      })
      expect(parent.key).not.toBe(child.key)

      const batch = await walletClient.mutateEntities({
        creates: [
          {
            payload: stringToPayload("parent"),
            contentType: "text/plain",
            attributes: { predictgroup: str(group), role: str("parent") },
            expires: LIFETIME,
            salt: parent.salt,
          },
          {
            payload: stringToPayload("child"),
            contentType: "text/plain",
            attributes: {
              predictgroup: str(group),
              role: str("child"),
              parent: key(parent.key),
            },
            expires: LIFETIME,
            salt: child.salt,
          },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: batch.txHash })

      expect(batch.createdEntities).toEqual([parent.key, child.key])
      expect((await publicClient.getEntity(parent.key)).attributes.role).toEqual(str("parent"))

      const children = await publicClient
        .select({ key: true, attributes: { parent: true } })
        .where(and(eq("predictgroup", str(group)), eq("role", str("child"))))
        .fetch()
      expect(children.entities.map((entity) => entity.key)).toEqual([child.key])
      expect(children.entities.map((entity) => entity.attributes.parent)).toEqual([key(parent.key)])

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
      const { entityKey, expiresAt, blockNumber } = await (async () => {
        const created = await walletClient.createEntity({
          payload: stringToPayload("brief"),
          contentType: "text/plain",
          attributes: { expirygroup: str(value) },
          expires: ExpirationTime.fromBlocks(20),
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: created.txHash })
        return { ...created, blockNumber: receipt.blockNumber }
      })()

      expect(expiresAt).toBeGreaterThan(blockNumber)

      // Wait out the lifetime. 20 blocks is seconds on a dev node and under a minute anywhere.
      const gone = await eventually(
        async () => (await publicClient.getBlockNumber()) > expiresAt,
        60_000,
      )
      expect(gone).toBe(true)

      await expect(publicClient.getEntity(entityKey)).rejects.toThrow(NoEntityFoundError)
      const live = await publicClient
        .select({ key: true })
        .where(eq("expirygroup", str(value)))
        .fetch()
      expect(live.entities).toHaveLength(0)

      const at = async (block: bigint) =>
        (
          await publicClient
            .select({ key: true })
            .where(eq("expirygroup", str(value)))
            .atBlock(block)
            .fetch()
        ).entities.length
      expect(await at(expiresAt - 1n)).toBe(1)
      expect(await at(expiresAt)).toBe(0)
    },
    { timeout: 90000 },
  )
})
