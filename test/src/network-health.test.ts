import { describe, expect, test } from "bun:test"
import type { PublicArkivClient, WalletArkivClient } from "@arkiv-network/sdk"
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
  jsonToPayload,
  NoEntityFoundError,
} from "@arkiv-network/sdk"
import { addr, bool, bytes32, dec, i32, key, str, u64, u256 } from "@arkiv-network/sdk/attr"
import { cheesecake, localhost } from "@arkiv-network/sdk/chains"
import {
  and,
  type Expression,
  eq,
  exists,
  gt,
  gte,
  hasType,
  lt,
  lte,
  ne,
  not,
  or,
  QueryError,
  startsWith,
} from "@arkiv-network/sdk/query"
import { type Chain, defineChain, getAddress, type Hex, http, isHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const PRIVATE_KEY = process.env.PRIVATE_KEY
if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY env var is required")
}

if (!isHex(PRIVATE_KEY)) {
  throw new Error("Malformed PRIVATE_KEY: must be a hex string")
}

const account = privateKeyToAccount(PRIVATE_KEY)

const RPC_URL_FROM_ENV = process.env.RPC_URL
const CHAIN_FROM_ENV = process.env.CHAIN

let chain: Chain | undefined
if (RPC_URL_FROM_ENV) {
  chain = defineChain({
    id: await createPublicClient({
      chain: localhost,
      transport: http(RPC_URL_FROM_ENV),
    }).getChainId(),
    name: `arkiv (${RPC_URL_FROM_ENV})`,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    rpcUrls: { default: { http: [RPC_URL_FROM_ENV] } },
  })
}

if (CHAIN_FROM_ENV) {
  const chains = { cheesecake, localhost } as const
  const found = chains[CHAIN_FROM_ENV as keyof typeof chains]
  if (!found) {
    throw new Error(
      `Unknown chain: ${CHAIN_FROM_ENV}. Valid options: ${Object.keys(chains).join(", ")}, or set RPC_URL.`,
    )
  }
  chain = found
}

if (!chain) {
  throw new Error(
    "No chain configured. Set RPC_URL to a node, or set CHAIN to one of cheesecake, localhost.",
  )
}

const publicClient: PublicArkivClient = createPublicClient({ chain, transport: http() })
const walletClient: WalletArkivClient = createWalletClient({
  chain,
  transport: http(),
  account,
})

/** A short lifetime for entities that only have to outlive the test that made them. */
const SHORT = ExpirationTime.fromHours(1)

describe(`Network health check (${chain.name})`, () => {
  test(
    "the chain is reachable",
    async () => {
      expect(await publicClient.getChainId()).toBe(chain.id)
      expect(await publicClient.getBlockNumber()).toBeGreaterThan(0n)
    },
    { timeout: 30_000 },
  )

  test(
    "the chain reports its block timing",
    async () => {
      const timing = await publicClient.getBlockTiming()
      expect(timing.currentBlock).toBeGreaterThan(0n)
      expect(timing.currentBlockTime).toBeGreaterThan(0)
      expect(timing.blockDuration).toBeGreaterThan(0)
    },
    { timeout: 30_000 },
  )

  test(
    "an entity comes back the way it was written",
    async () => {
      const tag = `health-${Date.now()}`
      const payload = jsonToPayload({ healthCheck: true, tag })

      const { entityKey, txHash, expiresAt } = await walletClient.createEntity({
        payload,
        contentType: "application/json",
        attributes: {
          tag,
          healthy: true,
          level: i32(42),
          height: u64(1_200_000n),
        },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const entity = await publicClient.getEntity(entityKey)

      expect(entity.key).toBe(entityKey)
      expect(entity.payload).toEqual(payload)
      expect(entity.toJson()).toMatchObject({ healthCheck: true, tag })
      expect(entity.contentType).toBe("application/json")
      expect(entity.owner).toBe(account.address)
      expect(entity.creator).toBe(account.address)
      expect(entity.expiresAt).toBe(expiresAt)
      expect(entity.createdAt).toBeGreaterThan(0n)

      expect(entity.attributes.tag).toEqual(str(tag))
      expect(entity.attributes.healthy).toEqual(bool(true))
      expect(entity.attributes.level).toEqual(i32(42))
      expect(entity.attributes.height).toEqual(u64(1_200_000n))

      expect(entity.creationFlags).toEqual({
        readonly: false,
        permissionlessExtension: false,
        raw: 0,
      })
      console.log(`  WRITE→READ  ${entityKey}`)
    },
    { timeout: 120_000 },
  )

  test(
    "an entity can be found by the attributes it was written with",
    async () => {
      const tag = `find-${Date.now()}`

      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ tag }),
        contentType: "application/json",
        attributes: { tag, category: "docs", level: i32(7) },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const found = await publicClient
        .select({ key: true, attributes: true })
        .where(eq("tag", str(tag)))
        .ownedBy(account.address)
        .fetch()

      expect(found.entities).toHaveLength(1)
      expect(found.entities[0]?.key).toBe(entityKey)
      expect(found.entities[0]?.attributes.category).toEqual(str("docs"))

      // Something that does not match must not come back.
      const missing = await publicClient
        .select({ key: true })
        .where(eq("tag", str(tag)), eq("category", str("nope")))
        .fetch()
      expect(missing.entities).toHaveLength(0)
      console.log(`  QUERY  found by attribute, and correctly not found`)
    },
    { timeout: 120_000 },
  )

  test(
    "a patch changes what it names and leaves everything else alone",
    async () => {
      const tag = `patch-${Date.now()}`
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ version: 1 }),
        contentType: "application/json",
        attributes: { tag, keep: "original", drop: "temporary", level: i32(1) },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const patch = await walletClient.patchEntity({
        entityKey,
        payload: jsonToPayload({ version: 2 }),
        contentType: "application/json",
        set: { level: i32(2) },
        unset: ["drop"],
      })
      await publicClient.waitForTransactionReceipt({ hash: patch.txHash })

      const patched = await publicClient.getEntity(entityKey)

      // What the patch named, changed.
      expect(patched.toJson()).toMatchObject({ version: 2 })
      expect(patched.attributes.level).toEqual(i32(2))
      // What it unset, gone.
      expect(patched.attributes.drop).toBeUndefined()
      // What it never mentioned, untouched.
      expect(patched.attributes.keep).toEqual(str("original"))
      expect(patched.attributes.tag).toEqual(str(tag))
      expect(patched.updatedAt).toBeGreaterThanOrEqual(patched.createdAt ?? 0n)
      console.log(`  PATCH  merged, tombstoned, and left the rest alone`)
    },
    { timeout: 120_000 },
  )

  test(
    "a deleted entity is gone",
    async () => {
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ doomed: true }),
        contentType: "application/json",
        attributes: { purpose: "delete_me" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      expect((await publicClient.getEntity(entityKey)).key).toBe(entityKey)

      const removed = await walletClient.deleteEntity({ entityKey })
      await publicClient.waitForTransactionReceipt({ hash: removed.txHash })

      await expect(publicClient.getEntity(entityKey)).rejects.toThrow(NoEntityFoundError)
      console.log(`  DELETE  entity gone`)
    },
    { timeout: 120_000 },
  )

  test(
    "an entity expires on its own",
    async () => {
      const ttlBlocks = 5
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ shortLived: true }),
        contentType: "application/json",
        attributes: { purpose: "ttl_test" },
        expires: ExpirationTime.fromBlocks(ttlBlocks),
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const entity = await publicClient.getEntity(entityKey)
      const expiresAt = entity.expiresAt
      if (expiresAt === undefined) throw new Error("entity has no expiresAt")
      console.log(`  EXPIRY  waiting for block ${expiresAt}`)

      const deadline = Date.now() + 120_000
      while (Date.now() < deadline) {
        if ((await publicClient.getBlockNumber()) > expiresAt) break
        await new Promise((r) => setTimeout(r, 3_000))
      }

      await expect(publicClient.getEntity(entityKey)).rejects.toThrow(NoEntityFoundError)
      console.log(`  EXPIRY  entity gone after its lifetime`)
    },
    { timeout: 240_000 },
  )

  test(
    "extending an entity pushes its expiry out",
    async () => {
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ extendTest: true }),
        contentType: "application/json",
        attributes: { purpose: "extend_test" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const before = await publicClient.getEntity(entityKey)

      const extended = await walletClient.extendEntity({
        entityKey,
        expires: ExpirationTime.fromHours(2),
      })
      await publicClient.waitForTransactionReceipt({ hash: extended.txHash })

      const after = await publicClient.getEntity(entityKey)
      expect(after.expiresAt).toBeGreaterThan(before.expiresAt ?? 0n)
      expect(after.expiresAt).toBe(extended.expiresAt)
      console.log(`  EXTEND  ${before.expiresAt} → ${after.expiresAt}`)
    },
    { timeout: 120_000 },
  )

  test(
    "transferring an entity moves it to the new owner but keeps its creator",
    async () => {
      const newOwner = "0x1234567890abcdef1234567890abcdef12345678" as Hex
      const tag = `owner-${Date.now()}`

      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ ownershipTest: true }),
        contentType: "application/json",
        attributes: { tag },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const transfer = await walletClient.changeOwnership({ entityKey, newOwner })
      await publicClient.waitForTransactionReceipt({ hash: transfer.txHash })

      const after = await publicClient.getEntity(entityKey)
      expect(after.owner).toBe(getAddress(newOwner))
      expect(after.creator).toBe(account.address)

      const byTag = eq("tag", str(tag))
      expect(
        (await publicClient.select({ key: true }).where(byTag).ownedBy(newOwner).fetch()).entities,
      ).toHaveLength(1)
      expect(
        (await publicClient.select({ key: true }).where(byTag).ownedBy(account.address).fetch())
          .entities,
      ).toHaveLength(0)
      expect(
        (await publicClient.select({ key: true }).where(byTag).createdBy(account.address).fetch())
          .entities,
      ).toHaveLength(1)
      console.log(`  OWNER  ownedBy follows the transfer, createdBy does not`)
    },
    { timeout: 120_000 },
  )

  test(
    "creation flags come back as they were set, and readonly is enforced",
    async () => {
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ readonlyTest: true }),
        contentType: "application/json",
        attributes: { purpose: "readonly_test" },
        expires: SHORT,
        flags: { readonly: true },
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const entity = await publicClient.getEntity(entityKey)
      expect(entity.creationFlags).toEqual({
        readonly: true,
        permissionlessExtension: false,
        raw: 0b01,
      })

      await expect(
        walletClient.patchEntity({ entityKey, set: { purpose: "should_fail" } }),
      ).rejects.toThrow()

      const extended = await walletClient.extendEntity({
        entityKey,
        expires: ExpirationTime.fromHours(2),
      })
      await publicClient.waitForTransactionReceipt({ hash: extended.txHash })
      console.log(`  FLAGS  readonly blocks a patch, still allows an extension`)
    },
    { timeout: 180_000 },
  )

  test(
    "a permanent entity is written with an expiry no chain will reach",
    async () => {
      const { entityKey, txHash, expiresAt } = await walletClient.createEntity({
        payload: new Uint8Array(),
        contentType: "application/octet-stream",
        attributes: { purpose: "permanent_test" },
        expires: ExpirationTime.permanent(),
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      expect(expiresAt).toBe(2n ** 64n - 1n)
      expect((await publicClient.getEntity(entityKey)).expiresAt).toBe(2n ** 64n - 1n)
      console.log(`  EXPIRY  permanent entity stored at ${expiresAt}`)
    },
    { timeout: 120_000 },
  )

  test(
    "a batch applies every one of its operations, or none",
    async () => {
      const tag = `batch-${Date.now()}`
      const pre = await walletClient.mutateEntities({
        creates: (["patch", "delete", "extend", "transfer"] as const).map((purpose) => ({
          payload: jsonToPayload({ batch: purpose }),
          contentType: "application/json" as const,
          attributes: { tag, purpose: `batch_${purpose}` },
          expires: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: pre.txHash })

      const [toPatch, toDelete, toExtend, toTransfer] = pre.createdEntities
      if (!toPatch || !toDelete || !toExtend || !toTransfer) {
        throw new Error(`expected 4 pre-created keys, got ${pre.createdEntities.length}`)
      }
      const expiryBefore = (await publicClient.getEntity(toExtend)).expiresAt ?? 0n

      const newOwner = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Hex
      const result = await walletClient.mutateEntities({
        creates: [
          {
            payload: jsonToPayload({ batch: "created" }),
            contentType: "application/json",
            attributes: { tag, purpose: "batch_created" },
            expires: SHORT,
          },
        ],
        patches: [{ entityKey: toPatch, set: { purpose: "batch_patched" } }],
        deletes: [{ entityKey: toDelete }],
        extensions: [{ entityKey: toExtend, expires: ExpirationTime.fromHours(2) }],
        ownershipChanges: [{ entityKey: toTransfer, newOwner }],
      })
      await publicClient.waitForTransactionReceipt({ hash: result.txHash })

      const created = result.createdEntities[0]
      if (!created) throw new Error("batch reported no created entity")
      expect((await publicClient.getEntity(created)).attributes.purpose).toEqual(
        str("batch_created"),
      )
      expect((await publicClient.getEntity(toPatch)).attributes.purpose).toEqual(
        str("batch_patched"),
      )
      await expect(publicClient.getEntity(toDelete)).rejects.toThrow(NoEntityFoundError)
      expect((await publicClient.getEntity(toExtend)).expiresAt).toBeGreaterThan(expiryBefore)
      expect((await publicClient.getEntity(toTransfer)).owner).toBe(getAddress(newOwner))
      console.log(`  BATCH  all five kinds applied in one transaction`)
    },
    { timeout: 240_000 },
  )

  test(
    "the keys a batch will mint can be worked out before it is sent",
    async () => {
      const tag = `predicted-${Date.now()}`
      const nonceBefore = await publicClient.getEntityNonce(account.address)

      // A literal count is a tuple, so the pairs destructure into names — no length check needed.
      const [parent, child] = await publicClient.predictEntityKeys({
        owner: account.address,
        count: 2,
      })
      expect(parent.key).not.toBe(child.key)

      // The second entity points at the first, whose key does not exist yet — which is the whole
      // reason to predict one.
      const batch = await walletClient.mutateEntities({
        creates: [
          {
            payload: jsonToPayload({ role: "parent" }),
            contentType: "application/json",
            attributes: { tag, role: "parent" },
            expires: SHORT,
            salt: parent.salt,
          },
          {
            payload: jsonToPayload({ role: "child" }),
            contentType: "application/json",
            attributes: { tag, role: "child", parent: key(parent.key) },
            expires: SHORT,
            salt: child.salt,
          },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: batch.txHash })

      // The engine minted exactly the keys that were predicted, in order.
      expect(batch.createdEntities).toEqual([parent.key, child.key])
      expect((await publicClient.getEntity(parent.key)).attributes.role).toEqual(str("parent"))

      // And the pointer the child was created with resolves to a real entity.
      const children = await publicClient
        .select({ key: true, attributes: { parent: true } })
        .where(and(eq("tag", str(tag)), eq("role", str("child"))))
        .fetch()
      expect(children.entities.map((entity) => entity.attributes.parent)).toEqual([key(parent.key)])

      // Two creates, two nonces.
      expect(await publicClient.getEntityNonce(account.address)).toBe(nonceBefore + 2n)
      console.log(`  KEYS  predicted 2 keys and the batch minted exactly them`)
    },
    { timeout: 120_000 },
  )

  test(
    "queries filter with every operator the language offers",
    async () => {
      const group = `filter-${Date.now()}`

      const created = await walletClient.mutateEntities({
        creates: [10, 20, 30, 40, 50].map((score) => ({
          payload: jsonToPayload({ group, score }),
          contentType: "application/json" as const,
          attributes: { group, score: i32(score) },
          expires: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (...predicates: Parameters<typeof and>) =>
        (
          await publicClient
            .select({ key: true })
            .where(and(...predicates))
            .fetch()
        ).entities.length

      expect(await count(inGroup, eq("score", i32(30)))).toBe(1)
      expect(await count(inGroup, ne("score", i32(30)))).toBe(4)
      expect(await count(inGroup, gt("score", i32(30)))).toBe(2)
      expect(await count(inGroup, gte("score", i32(30)))).toBe(3)
      expect(await count(inGroup, lt("score", i32(30)))).toBe(2)
      expect(await count(inGroup, lte("score", i32(30)))).toBe(3)
      expect(await count(inGroup, or(eq("score", i32(10)), eq("score", i32(50))))).toBe(2)
      expect(await count(inGroup, and(gt("score", i32(10)), lt("score", i32(50))))).toBe(3)
      expect(await count(inGroup, not(eq("score", i32(30))))).toBe(4)
      console.log(`  FILTER  every operator agreed with the data`)
    },
    { timeout: 180_000 },
  )

  test(
    "a projection returns exactly the fields it asked for",
    async () => {
      const tag = `proj-${Date.now()}`
      const { txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ projection: true, tag }),
        contentType: "application/json",
        attributes: { tag, color: "blue" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      const where = eq("tag", str(tag))

      const keyOnly = await publicClient.select({ key: true }).where(where).fetch()
      expect(keyOnly.entities[0]?.key).toBeDefined()
      // @ts-expect-error payload was not selected
      expect(keyOnly.entities[0].payload).toBeUndefined()
      // @ts-expect-error owner was not selected
      expect(keyOnly.entities[0].owner).toBeUndefined()
      // @ts-expect-error attributes were not selected
      expect(keyOnly.entities[0].attributes).toBeUndefined()

      const payloadOnly = await publicClient.select({ payload: true }).where(where).fetch()
      expect(payloadOnly.entities[0]?.toJson()).toMatchObject({ projection: true, tag })

      const metadata = await publicClient
        .select({
          owner: true,
          creator: true,
          contentType: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          creationFlags: true,
        })
        .where(where)
        .fetch()
      const meta = metadata.entities[0]
      if (!meta) throw new Error("no entity returned for metadata projection")
      expect(meta.owner).toBeDefined()
      expect(meta.creator).toBeDefined()
      expect(meta.contentType).toBe("application/json")
      expect(meta.createdAt).toBeGreaterThan(0n)
      expect(meta.updatedAt).toBeGreaterThan(0n)
      expect(meta.expiresAt).toBeGreaterThan(0n)
      expect(meta.creationFlags.readonly).toBe(false)
      // @ts-expect-error payload was not selected
      expect(meta.payload).toBeUndefined()

      const schema = await publicClient.select({ attributeSchema: true }).where(where).fetch()
      expect(schema.entities[0]?.attributeSchema.tag).toBe("str")

      const oneAttribute = await publicClient
        .select({ key: true, attributes: { color: true } })
        .where(where)
        .fetch()
      expect(oneAttribute.entities[0]?.attributes.color).toEqual(str("blue"))
      expect(oneAttribute.entities[0]?.attributes.tag).toBeUndefined()

      const everything = await publicClient.select("*").where(where).fetch()
      expect(everything.entities[0]?.payload.length).toBeGreaterThan(0)
      expect(everything.entities[0]?.attributes.tag).toEqual(str(tag))
      console.log(`  SELECT  projections returned exactly what was asked for`)
    },
    { timeout: 180_000 },
  )

  test(
    "a large result set pages without losing or repeating anything",
    async () => {
      const group = `page-${Date.now()}`
      const created = await walletClient.mutateEntities({
        creates: Array.from({ length: 8 }, (_, index) => ({
          payload: jsonToPayload({ group, index }),
          contentType: "application/json" as const,
          attributes: { group },
          expires: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const page1 = await publicClient
        .select({ key: true })
        .where(eq("group", str(group)))
        .limit(3)
        .fetch()
      expect(page1.entities).toHaveLength(3)
      expect(page1.hasNextPage()).toBe(true)

      const page2 = await page1.next()
      const page3 = await page2.next()
      expect(page2.entities).toHaveLength(3)
      expect(page3.entities).toHaveLength(2)
      expect(page3.hasNextPage()).toBe(false)
      await expect(page3.next()).rejects.toThrow()

      // Every page of one walk reads the same block, so nothing can shift under the reader.
      expect(page2.blockNumber).toBe(page1.blockNumber)
      expect(page3.blockNumber).toBe(page1.blockNumber)

      const keys = [...page1.entities, ...page2.entities, ...page3.entities].map((e) => e.key)
      expect(new Set(keys).size).toBe(8)
      console.log(`  PAGE  8 entities over 3 pages, none lost or repeated`)
    },
    { timeout: 180_000 },
  )

  test(
    "every attribute type round-trips and stays queryable",
    async () => {
      const tag = `attrs-${Date.now()}`
      const digest = `0x${"de".repeat(32)}` as Hex
      const dangling = `0x${"ab".repeat(32)}` as Hex
      const huge = 2n ** 200n

      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ attrTest: true }),
        contentType: "application/json",
        attributes: {
          tag,
          text: "hello",
          count: 42,
          zero: 0,
          negative: i32(-10),
          big: u64(BigInt(Number.MAX_SAFE_INTEGER)),
          amount: u256(huge),
          score: dec("3.5"),
          flagged: true,
          digest: bytes32(digest),
          who: addr(account.address),
          parent: key(dangling),
        },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const { attributes, attributeSchema } = await publicClient.getEntity(entityKey)
      expect(attributes.text).toEqual(str("hello"))
      expect(attributes.count).toEqual(i32(42))
      expect(attributes.zero).toEqual(i32(0))
      expect(attributes.negative).toEqual(i32(-10))
      expect(attributes.big).toEqual(u64(BigInt(Number.MAX_SAFE_INTEGER)))
      expect(attributes.amount).toEqual(u256(huge))
      expect(attributes.score).toEqual(dec("3.5"))
      expect(attributes.flagged).toEqual(bool(true))
      expect(attributes.digest).toEqual(bytes32(digest))
      expect(attributes.who).toEqual(addr(account.address))
      expect(attributes.parent).toEqual(key(dangling))

      expect(attributeSchema).toMatchObject({
        text: "str",
        count: "i32",
        big: "u64",
        amount: "u256",
        score: "dec",
        flagged: "bool",
        digest: "bytes32",
        who: "addr",
        parent: "key",
      })

      const byTag = eq("tag", str(tag))
      const matches = async (predicate: ReturnType<typeof eq>) =>
        (await publicClient.select({ key: true }).where(byTag, predicate).fetch()).entities.length

      expect(await matches(eq("count", i32(42)))).toBe(1)
      expect(await matches(eq("big", u64(BigInt(Number.MAX_SAFE_INTEGER))))).toBe(1)
      expect(await matches(eq("amount", u256(huge)))).toBe(1)
      expect(await matches(eq("score", dec("3.5")))).toBe(1)
      expect(await matches(eq("who", addr(account.address)))).toBe(1)
      expect(await matches(eq("parent", key(dangling)))).toBe(1)
      expect(await matches(eq("digest", bytes32(digest)))).toBe(1)
      expect(await matches(eq("digest", bytes32(`0x${"11".repeat(32)}`)))).toBe(0)

      expect(await matches(gt("score", dec("3.4999")))).toBe(1)
      expect(await matches(lt("score", dec("3.4999")))).toBe(0)
      expect(await matches(gte("amount", u256(huge)))).toBe(1)
      expect(await matches(gt("amount", u256(huge)))).toBe(0)
      expect(await matches(lt("negative", i32(0)))).toBe(1)
      console.log(`  ATTRS  all nine settable types round-tripped, matched and ordered`)
    },
    { timeout: 180_000 },
  )

  test(
    "a raw query string works for a query built elsewhere",
    async () => {
      const tag = `raw-${Date.now()}`
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ rawQuery: true, tag }),
        contentType: "application/json",
        attributes: { tag, status: "active" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const result = await publicClient.query(`tag = str('${tag}') AND status = str('active')`, {
        select: { key: true, payload: true },
      })
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0]?.key).toBe(entityKey)
      expect(result.entities[0]?.payload).toBeDefined()

      const negated = await publicClient.query(
        `tag = str('${tag}') AND NOT (status = str('active'))`,
        { select: { key: true } },
      )
      expect(negated.entities).toHaveLength(0)
      console.log(`  RAW  raw query matched, and NOT excluded it`)
    },
    { timeout: 120_000 },
  )

  test(
    "entity events arrive as the operations are applied",
    async () => {
      const seen: { type: string; entityKey: Hex }[] = []
      const unwatch = publicClient.watchEntityEvents({
        onEvent: (event) => seen.push({ type: event.type, entityKey: event.entityKey }),
        onError: (error) => console.log(`  WATCH  error: ${error.message}`),
      })

      try {
        const { entityKey, txHash } = await walletClient.createEntity({
          payload: jsonToPayload({ eventTest: true }),
          contentType: "application/json",
          attributes: { purpose: "event_test" },
          expires: SHORT,
        })
        await publicClient.waitForTransactionReceipt({ hash: txHash })

        const patch = await walletClient.patchEntity({
          entityKey,
          set: { purpose: "event_test_patched" },
        })
        await publicClient.waitForTransactionReceipt({ hash: patch.txHash })

        const extend = await walletClient.extendEntity({
          entityKey,
          expires: ExpirationTime.fromHours(2),
        })
        await publicClient.waitForTransactionReceipt({ hash: extend.txHash })

        const removed = await walletClient.deleteEntity({ entityKey })
        await publicClient.waitForTransactionReceipt({ hash: removed.txHash })

        // The watcher polls; give it a few intervals to drain.
        await new Promise((r) => setTimeout(r, 6_000))

        expect(seen.filter((e) => e.entityKey === entityKey).map((e) => e.type)).toEqual([
          "EntityCreated",
          "EntityPatched",
          "ExpiryExtended",
          "EntityDeleted",
        ])
        console.log(`  EVENTS  four operations, four events, in order`)
      } finally {
        unwatch()
      }
    },
    { timeout: 180_000 },
  )

  test(
    "the entity count reflects what is stored",
    async () => {
      const before = await publicClient.getEntityCount()
      const { txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ countTest: true }),
        contentType: "application/json",
        attributes: { purpose: "count_test" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      expect(await publicClient.getEntityCount()).toBeGreaterThan(before)
      console.log(`  COUNT  ${before} → ${await publicClient.getEntityCount()}`)
    },
    { timeout: 120_000 },
  )

  test(
    "STARTSWITH matches a string prefix",
    async () => {
      const group = `prefix-${Date.now()}`
      const created = await walletClient.mutateEntities({
        creates: ["alpha-one", "alpha-two", "beta-one"].map((label) => ({
          payload: jsonToPayload({ group, label }),
          contentType: "application/json" as const,
          attributes: { group, label },
          expires: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ key: true }).where(inGroup, predicate).fetch()).entities.length

      expect(await count(startsWith("label", "alpha"))).toBe(2)
      expect(await count(startsWith("label", "alpha-o"))).toBe(1)
      expect(await count(startsWith("label", "beta"))).toBe(1)
      expect(await count(startsWith("label", "gamma"))).toBe(0)
      expect(await count(startsWith("label", "alpha-one"))).toBe(1)
      expect(await count(startsWith("label", "ALPHA"))).toBe(0)
      console.log(`  PREFIX  STARTSWITH narrowed by prefix, case-sensitively`)
    },
    { timeout: 180_000 },
  )

  test(
    "EXISTS finds attributes by presence, whatever they hold",
    async () => {
      const group = `exists-${Date.now()}`
      const created = await walletClient.mutateEntities({
        creates: [
          {
            payload: jsonToPayload({ group, has: true }),
            contentType: "application/json" as const,
            attributes: { group, reviewed: "yes" },
            expires: SHORT,
          },
          {
            payload: jsonToPayload({ group, has: false }),
            contentType: "application/json" as const,
            attributes: { group },
            expires: SHORT,
          },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ key: true }).where(inGroup, predicate).fetch()).entities.length

      expect(await count(exists("reviewed"))).toBe(1)
      expect(await count(not(exists("reviewed")))).toBe(1)
      expect(await count(exists("neverwritten"))).toBe(0)
      console.log(`  EXISTS  presence and absence both answered`)
    },
    { timeout: 180_000 },
  )

  test(
    "TYPEOF tells apart one name written with two types",
    async () => {
      const group = `typeof-${Date.now()}`
      const created = await walletClient.mutateEntities({
        creates: [
          {
            payload: jsonToPayload({ group, kind: "number" }),
            contentType: "application/json" as const,
            attributes: { group, reading: i32(1) },
            expires: SHORT,
          },
          {
            payload: jsonToPayload({ group, kind: "text" }),
            contentType: "application/json" as const,
            attributes: { group, reading: str("1") },
            expires: SHORT,
          },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ key: true }).where(inGroup, predicate).fetch()).entities.length

      expect(await count(hasType("reading", "i32"))).toBe(1)
      expect(await count(hasType("reading", "str"))).toBe(1)
      expect(await count(hasType("reading", "bool"))).toBe(0)
      expect(await count(eq("reading", i32(1)))).toBe(1)
      expect(await count(eq("reading", str("1")))).toBe(1)
      console.log(`  TYPEOF  one name, two types, told apart`)
    },
    { timeout: 180_000 },
  )

  test(
    "the indexed system attributes answer predicates",
    async () => {
      const tag = `sys-${Date.now()}`
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ systemTest: true }),
        contentType: "application/json",
        attributes: { tag },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const { expiresAt } = await publicClient.getEntity(entityKey)

      const byTag = eq("tag", str(tag))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ key: true }).where(byTag, predicate).fetch()).entities.length

      expect(await count(eq("$key", key(entityKey)))).toBe(1)
      expect(await count(eq("$key", key(`0x${"77".repeat(32)}`)))).toBe(0)
      expect(await count(eq("$owner", addr(account.address)))).toBe(1)
      expect(await count(eq("$creator", addr(account.address)))).toBe(1)

      expect(await count(eq("$expiresAt", u64(expiresAt)))).toBe(1)
      expect(await count(lt("$expiresAt", u64(expiresAt + 1n)))).toBe(1)
      expect(await count(gt("$expiresAt", u64(expiresAt)))).toBe(0)
      expect(await count(gte("$expiresAt", u64(expiresAt)))).toBe(1)
      console.log(`  SYSTEM  $key, $owner, $creator and $expiresAt all filtered`)
    },
    { timeout: 120_000 },
  )

  test(
    "a query reads the state of a past block",
    async () => {
      const tag = `history-${Date.now()}`
      const { txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ historyTest: true }),
        contentType: "application/json",
        attributes: { tag },
        expires: SHORT,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

      const where = eq("tag", str(tag))
      const at = async (block: bigint) =>
        (await publicClient.select({ key: true }).where(where).atBlock(block).fetch()).entities
          .length

      expect(await at(receipt.blockNumber)).toBe(1)
      expect(await at(receipt.blockNumber - 1n)).toBe(0)
      console.log(
        `  HISTORY  absent at ${receipt.blockNumber - 1n}, present at ${receipt.blockNumber}`,
      )
    },
    { timeout: 120_000 },
  )

  test(
    "a rejected query says which kind of rejection it was",
    async () => {
      const group = `errors-${Date.now()}`
      const created = await walletClient.mutateEntities({
        creates: [1, 2].map((index) => ({
          payload: jsonToPayload({ group, index }),
          contentType: "application/json" as const,
          attributes: { group },
          expires: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const kindOf = async (query: string, options?: { cursor?: string; atBlock?: bigint }) => {
        try {
          await publicClient.query(query, { select: { key: true }, ...options })
          return "accepted"
        } catch (error) {
          return error instanceof QueryError ? error.kind : `not a QueryError: ${String(error)}`
        }
      }

      expect(await kindOf(`group = = str('${group}')`)).toBe("parse")
      expect(await kindOf(`group = str('${group}') AND rank = i32(2147483648)`)).toBe("literal")
      expect(await kindOf("(".repeat(200))).toBe("limits")
      expect(await kindOf(`group = str('${group}')`, { atBlock: 10n ** 12n })).toBe("block")
      expect(await kindOf(`group > str('${group}')`)).toBe("type")

      const firstPage = await publicClient.query(`group = str('${group}')`, {
        select: { key: true },
        limit: 1,
      })
      expect(firstPage.cursor).toBeDefined()
      expect(
        await kindOf(`group = str('${group}') AND rank = i32(1)`, { cursor: firstPage.cursor }),
      ).toBe("cursor")
      expect(await kindOf(`group = str('${group}')`, { cursor: "b64:AAAAAAAAAAAAAAAA" })).toBe(
        "cursor",
      )
      console.log(`  ERRORS  every rejection arrived under its own kind`)
    },
    { timeout: 180_000 },
  )

  test(
    "the engine refuses operations it should",
    async () => {
      const absent = `0x${"99".repeat(32)}` as Hex
      const set = { purpose: "should_not_apply" }

      // Nothing to patch.
      await expect(walletClient.patchEntity({ entityKey: absent, set })).rejects.toThrow(
        /no entity/,
      )

      // Not yours to patch: ownership moved, and with it the right to change the contents.
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ authTest: true }),
        contentType: "application/json",
        attributes: { purpose: "auth_test" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      const transfer = await walletClient.changeOwnership({
        entityKey,
        newOwner: "0x00000000000000000000000000000000000000aa" as Hex,
      })
      await publicClient.waitForTransactionReceipt({ hash: transfer.txHash })
      await expect(walletClient.patchEntity({ entityKey, set })).rejects.toThrow(/owned by/)

      // Lifetimes never shorten. The engine resolves the pair the SDK sends against the block the
      // transaction lands in, so this is its judgement, not the SDK's.
      const { entityKey: liveKey, txHash: liveHash } = await walletClient.createEntity({
        payload: jsonToPayload({ shortenTest: true }),
        contentType: "application/json",
        attributes: { purpose: "shorten_test" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: liveHash })
      await expect(
        walletClient.extendEntity({ entityKey: liveKey, expires: ExpirationTime.fromBlocks(1) }),
      ).rejects.toThrow()
      console.log(`  REVERTS  missing entity, wrong owner and a shortened expiry all refused`)
    },
    { timeout: 240_000 },
  )

  test(
    "every attribute name the grammar allows is accepted",
    async () => {
      const tag = `names-${Date.now()}`
      // The grammar is a leading letter, then letters, digits, `.`, `-` or `_`, up to 32 bytes.
      const longest = `n${"a".repeat(31)}`
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ nameTest: true }),
        contentType: "application/json",
        attributes: {
          tag,
          lowercase: str("a"),
          Uppercase: str("b"),
          MiXeDcAsE: str("c"),
          with9digits: str("d"),
          "dotted.name": str("e"),
          "dashed-name": str("f"),
          under_scored: str("g"),
          [longest]: str("h"),
          // Names are case-sensitive, so these are two attributes, not one written twice.
          Level: i32(1),
          level: i32(2),
        },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const { attributes } = await publicClient.getEntity(entityKey)
      expect(attributes.lowercase).toEqual(str("a"))
      expect(attributes.Uppercase).toEqual(str("b"))
      expect(attributes.MiXeDcAsE).toEqual(str("c"))
      expect(attributes.with9digits).toEqual(str("d"))
      expect(attributes["dotted.name"]).toEqual(str("e"))
      expect(attributes["dashed-name"]).toEqual(str("f"))
      expect(attributes.under_scored).toEqual(str("g"))
      expect(attributes[longest]).toEqual(str("h"))
      expect(attributes.Level).toEqual(i32(1))
      expect(attributes.level).toEqual(i32(2))

      const byTag = eq("tag", str(tag))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ key: true }).where(byTag, predicate).fetch()).entities.length

      expect(await count(eq("Uppercase", str("b")))).toBe(1)
      expect(await count(eq("MiXeDcAsE", str("c")))).toBe(1)
      expect(await count(eq("dotted.name", str("e")))).toBe(1)
      expect(await count(eq("dashed-name", str("f")))).toBe(1)
      expect(await count(eq("under_scored", str("g")))).toBe(1)
      expect(await count(eq(longest, str("h")))).toBe(1)

      expect(await count(eq("Level", i32(1)))).toBe(1)
      expect(await count(eq("level", i32(2)))).toBe(1)
      expect(await count(eq("Level", i32(2)))).toBe(0)
      expect(await count(eq("level", i32(1)))).toBe(0)
      console.log(`  NAMES  every legal spelling written, read back and queried`)
    },
    { timeout: 180_000 },
  )

  test(
    "a batch that cannot apply in full applies none of it",
    async () => {
      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ atomicTest: true }),
        contentType: "application/json",
        attributes: { purpose: "atomic_original" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // One good operation and one impossible one
      await expect(
        walletClient.mutateEntities({
          patches: [{ entityKey, set: { purpose: "atomic_changed" } }],
          deletes: [{ entityKey: `0x${"88".repeat(32)}` as Hex }],
        }),
      ).rejects.toThrow()

      expect((await publicClient.getEntity(entityKey)).attributes.purpose).toEqual(
        str("atomic_original"),
      )
      console.log(`  ATOMIC  the good operation in a failed batch did not apply`)
    },
    { timeout: 180_000 },
  )

  test(
    "every event type reaches its own handler",
    async () => {
      const byType: Record<string, Hex[]> = {}
      const order: { type: string; entityKey: Hex }[] = []
      const record = (type: string) => (event: { entityKey: Hex }) => {
        const keys = byType[type] ?? []
        keys.push(event.entityKey)
        byType[type] = keys
      }

      const unwatch = publicClient.watchEntityEvents({
        onEntityCreated: record("EntityCreated"),
        onEntityPatched: record("EntityPatched"),
        onExpiryExtended: record("ExpiryExtended"),
        onOwnershipTransferred: record("OwnershipTransferred"),
        onEntityDeleted: record("EntityDeleted"),
        onEvent: (event) => order.push({ type: event.type, entityKey: event.entityKey }),
        onError: (error) => console.log(`  WATCH  error: ${error.message}`),
      })

      try {
        const base = {
          contentType: "application/json" as const,
          attributes: { purpose: "handler_test" },
          expires: SHORT,
        }
        const created = await walletClient.mutateEntities({
          creates: [
            { ...base, payload: jsonToPayload({ role: "mutated" }) },
            { ...base, payload: jsonToPayload({ role: "transferred" }) },
          ],
        })
        await publicClient.waitForTransactionReceipt({ hash: created.txHash })
        const [mutated, transferred] = created.createdEntities
        if (!mutated || !transferred) throw new Error("expected two created keys")

        const patch = await walletClient.patchEntity({
          entityKey: mutated,
          set: { purpose: "handler_patched" },
        })
        await publicClient.waitForTransactionReceipt({ hash: patch.txHash })

        const extend = await walletClient.extendEntity({
          entityKey: mutated,
          expires: ExpirationTime.fromHours(2),
        })
        await publicClient.waitForTransactionReceipt({ hash: extend.txHash })

        const transfer = await walletClient.changeOwnership({
          entityKey: transferred,
          newOwner: "0x00000000000000000000000000000000000000bb" as Hex,
        })
        await publicClient.waitForTransactionReceipt({ hash: transfer.txHash })

        const removed = await walletClient.deleteEntity({ entityKey: mutated })
        await publicClient.waitForTransactionReceipt({ hash: removed.txHash })

        await new Promise((r) => setTimeout(r, 6_000))

        expect(byType.EntityCreated).toContain(mutated)
        expect(byType.EntityCreated).toContain(transferred)
        expect(byType.EntityPatched).toContain(mutated)
        expect(byType.ExpiryExtended).toContain(mutated)
        expect(byType.OwnershipTransferred).toContain(transferred)
        expect(byType.EntityDeleted).toContain(mutated)

        expect(order.filter((e) => e.entityKey === mutated).map((e) => e.type)).toEqual([
          "EntityCreated",
          "EntityPatched",
          "ExpiryExtended",
          "EntityDeleted",
        ])
        expect(order.filter((e) => e.entityKey === transferred).map((e) => e.type)).toEqual([
          "EntityCreated",
          "OwnershipTransferred",
        ])
        console.log(`  EVENTS  all five handlers fired, and onEvent kept the order`)
      } finally {
        unwatch()
      }
    },
    { timeout: 300_000 },
  )

  test(
    "a watcher started with fromBlock sees what it missed",
    async () => {
      const from = await publicClient.getBlockNumber()

      const { entityKey, txHash } = await walletClient.createEntity({
        payload: jsonToPayload({ backfillTest: true }),
        contentType: "application/json",
        attributes: { purpose: "backfill_test" },
        expires: SHORT,
      })
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      const seen: { at: string; entityKey: Hex }[] = []
      const unwatch = publicClient.watchEntityEvents({
        onEntityCreated: (event) =>
          seen.push({ at: `${event.blockNumber}:${event.logIndex}`, entityKey: event.entityKey }),
        onError: (error) => console.log(`  WATCH  error: ${error.message}`),
        fromBlock: from,
      })

      try {
        const deadline = Date.now() + 60_000
        while (Date.now() < deadline && !seen.some((e) => e.entityKey === entityKey)) {
          await new Promise((r) => setTimeout(r, 2_000))
        }
        expect(seen.map((e) => e.entityKey)).toContain(entityKey)

        // Keep watching across a few more blocks.
        await new Promise((r) => setTimeout(r, 10_000))
        expect(new Set(seen.map((e) => e.at)).size).toBe(seen.length)
        console.log(`  BACKFILL  replayed ${seen.length} create(s) from block ${from}, no repeats`)
      } finally {
        unwatch()
      }
    },
    { timeout: 180_000 },
  )

  test(
    "a deeply nested query returns exactly the right set",
    async () => {
      //   id | color | flag
      //    0 | red   | true
      //    1 | green | false
      //    2 | blue  | true
      //    3 | red   | false
      //    4 | green | true
      //    5 | blue  | false
      //    6 | red   | true
      //    7 | green | false
      //    8 | blue  | true
      //    9 | -     | -
      const rows = [
        { id: i32(0), color: str("red"), flag: true },
        { id: i32(1), color: str("green"), flag: false },
        { id: i32(2), color: str("blue"), flag: true },
        { id: i32(3), color: str("red"), flag: false },
        { id: i32(4), color: str("green"), flag: true },
        { id: i32(5), color: str("blue"), flag: false },
        { id: i32(6), color: str("red"), flag: true },
        { id: i32(7), color: str("green"), flag: false },
        { id: i32(8), color: str("blue"), flag: true },
        { id: i32(9) },
      ] as const

      const group = `nested-query-${Date.now()}`
      const created = await walletClient.mutateEntities({
        creates: rows.map((row) => ({
          payload: jsonToPayload({ id: row.id }),
          contentType: "application/json" as const,
          attributes: {
            group,
            ...row,
          },
          expires: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })
      expect(created.createdEntities).toHaveLength(rows.length)

      const inGroup = eq("group", str(group))

      const cases: { query: Expression; expected: number[] }[] = [
        {
          // (3 <= id < 7) OR blue
          query: or(and(gte("id", i32(3)), lt("id", i32(7))), eq("color", str("blue"))),
          expected: [2, 3, 4, 5, 6, 8],
        },
        {
          // red OR (id >= 6 AND flagged)
          query: or(eq("color", str("red")), and(gte("id", i32(6)), eq("flag", true))),
          expected: [0, 3, 6, 8],
        },
        {
          // NOT (red OR flagged)
          query: not(or(eq("color", str("red")), eq("flag", true))),
          expected: [1, 5, 7, 9],
        },
        {
          // NOT red AND NOT flagged
          query: and(not(eq("color", str("red"))), not(eq("flag", true))),
          expected: [1, 5, 7, 9],
        },
        {
          // (id >= 2 AND (red OR green)) OR id = 9
          query: or(
            and(gte("id", i32(2)), or(eq("color", str("red")), eq("color", str("green")))),
            eq("id", i32(9)),
          ),
          expected: [3, 4, 6, 7, 9],
        },
        {
          // id >= 1 AND NOT ((blue AND flagged) OR id < 3)
          query: and(
            gte("id", i32(1)),
            not(or(and(eq("color", str("blue")), eq("flag", true)), lt("id", i32(3)))),
          ),
          expected: [3, 4, 5, 6, 7, 9],
        },
        {
          // (id < 3 AND (flagged OR green)) OR (id >= 7 AND NOT (green AND not flagged))
          query: or(
            and(lt("id", i32(3)), or(eq("flag", true), eq("color", str("green")))),
            and(gte("id", i32(7)), not(and(eq("color", str("green")), eq("flag", false)))),
          ),
          expected: [0, 1, 2, 8, 9],
        },
        {
          // id >= 8 AND NOT blue.
          query: and(gte("id", i32(8)), not(eq("color", str("blue")))),
          expected: [9],
        },
      ]

      for (const { query, expected } of cases) {
        const page = await publicClient
          .select({ key: true, attributes: { id: true } })
          .where(inGroup, query)
          .limit(200)
          .fetch()
        const ids = page.entities.map((e) => Number(e.attributes.id?.value)).sort((a, b) => a - b)
        expect({ query: String(query), ids }).toEqual({ query: String(query), ids: expected })
      }
      console.log(`  NESTED  ${cases.length} nested queries returned exactly the expected ids`)
    },
    { timeout: 240_000 },
  )
})
