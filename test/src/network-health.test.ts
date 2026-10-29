import { describe, expect, test } from "bun:test"
import type {
  CreateEntityValues,
  CreationFlags,
  Expiry,
  PublicArkivClient,
  Schema,
  WalletArkivClient,
} from "@arkiv-network/sdk"
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
  NoEntityFoundError,
} from "@arkiv-network/sdk"
import { localhost, rabdi } from "@arkiv-network/sdk/chains"
import {
  and,
  asc,
  type Expression,
  eq,
  exists,
  gt,
  gte,
  hasType,
  lt,
  lte,
  or,
  QueryError,
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
import {
  type Chain,
  defineChain,
  getAddress,
  type Hex,
  hexToString,
  http,
  isHex,
  stringToBytes,
} from "viem"
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
  // A chain Arkiv hosts takes its access key from ARKIV_ACCESS_KEY
  const chains = {
    rabdi: () => rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }),
    localhost: () => localhost,
  } as const
  const found = chains[CHAIN_FROM_ENV as keyof typeof chains]
  if (!found) {
    throw new Error(
      `Unknown chain: ${CHAIN_FROM_ENV}. Valid options: ${Object.keys(chains).join(", ")}, or set RPC_URL.`,
    )
  }
  chain = found()
}

if (!chain) {
  throw new Error(
    "No chain configured. Set RPC_URL to a node, or set CHAIN to one of rabdi, localhost.",
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

/**
 * What most checks write: an indexed tag and purpose to find an entity by, and an unindexed body
 * standing in for what used to be the payload.
 */
const Probe = defineSchema({
  tag: str().indexed().optional(),
  purpose: str().indexed().optional(),
  body: bytes().optional(),
})

/** Creates one entity and waits for it to land. */
async function create<S extends Schema>(
  schema: S,
  values: CreateEntityValues<S>,
  options: { expiration?: Expiry; flags?: CreationFlags } = {},
) {
  const created = await walletClient.createEntity(schema, values, {
    expiration: options.expiration ?? SHORT,
    ...(options.flags ? { flags: options.flags } : {}),
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: created.txHash })
  return { ...created, blockNumber: receipt.blockNumber }
}

/** JSON as the bytes of a body column. */
const json = (value: unknown) => stringToBytes(JSON.stringify(value))

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
      const Health = defineSchema({
        tag: str().indexed(),
        healthy: bool().indexed(),
        level: i32().indexed(),
        height: u64(),
        body: bytes(),
        mimeType: str().default("application/json"),
      })
      const body = json({ healthCheck: true, tag })

      const { entityKey, expiresAt } = await create(Health, {
        tag,
        healthy: true,
        level: i32(42),
        height: u64(1_200_000n),
        body,
      })

      const entity = await publicClient.getEntity(entityKey, Health)

      expect(entity.$key).toBe(entityKey)
      expect(entity.body).toEqual(bytes(body))
      expect(JSON.parse(hexToString(entity.body.value))).toMatchObject({ healthCheck: true, tag })
      expect(entity.mimeType).toEqual(str("application/json"))
      expect(entity.$owner).toBe(account.address)
      expect(entity.$creator).toBe(account.address)
      expect(entity.$expiresAt).toBe(expiresAt)
      expect(entity.$createdAt).toBeGreaterThan(0n)

      expect(entity.tag).toEqual(str(tag))
      expect(entity.healthy).toEqual(bool(true))
      expect(entity.level).toEqual(i32(42))
      expect(entity.height).toEqual(u64(1_200_000n))

      expect(entity.$creationFlags).toEqual({
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
      const Docs = defineSchema({ tag: str().indexed(), category: str().indexed(), level: i32() })

      const { entityKey } = await create(Docs, { tag, category: "docs", level: i32(7) })

      const found = await publicClient
        .select({ $key: true, category: true, level: true })
        .from(Docs)
        .where(eq("tag", str(tag)))
        .ownedBy(account.address)
        .fetch()

      expect(found.entities).toHaveLength(1)
      expect(found.entities[0]?.$key).toBe(entityKey)
      expect(found.entities[0]?.category).toEqual(str("docs"))
      expect(found.entities[0]?.level).toEqual(i32(7))

      // Something that does not match must not come back.
      const missing = await publicClient
        .select({ $key: true })
        .from(Docs)
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
      const Versioned = defineSchema({
        tag: str().indexed(),
        keep: str(),
        drop: str().optional(),
        level: i32().indexed(),
        body: bytes(),
      })
      const { entityKey } = await create(Versioned, {
        tag,
        keep: "original",
        drop: "temporary",
        level: i32(1),
        body: json({ version: 1 }),
      })

      const patch = await walletClient.patchEntity(Versioned, entityKey, {
        set: { body: json({ version: 2 }), level: i32(2) },
        unset: ["drop"],
      })
      await publicClient.waitForTransactionReceipt({ hash: patch.txHash })

      const patched = await publicClient.getEntity(entityKey, Versioned)

      // What the patch named, changed.
      expect(JSON.parse(hexToString(patched.body.value))).toMatchObject({ version: 2 })
      expect(patched.level).toEqual(i32(2))
      // What it unset, gone.
      expect(patched.drop).toBeUndefined()
      // What it never mentioned, untouched.
      expect(patched.keep).toEqual(str("original"))
      expect(patched.tag).toEqual(str(tag))
      expect(patched.$updatedAt).toBeGreaterThanOrEqual(patched.$createdAt)
      console.log(`  PATCH  merged, tombstoned, and left the rest alone`)
    },
    { timeout: 120_000 },
  )

  test(
    "a deleted entity is gone",
    async () => {
      const { entityKey } = await create(Probe, {
        purpose: "delete_me",
        body: json({ doomed: true }),
      })
      expect((await publicClient.getEntity(entityKey)).$key).toBe(entityKey)

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
      const { entityKey } = await create(
        Probe,
        { purpose: "ttl_test" },
        { expiration: ExpirationTime.fromBlocks(ttlBlocks) },
      )

      const entity = await publicClient.getEntity(entityKey)
      const expiresAt = entity.$expiresAt
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
      const { entityKey } = await create(Probe, { purpose: "extend_test" })

      const before = await publicClient.getEntity(entityKey)

      const extended = await walletClient.extendEntity({
        entityKey,
        expiration: ExpirationTime.fromHours(2),
      })
      await publicClient.waitForTransactionReceipt({ hash: extended.txHash })

      const after = await publicClient.getEntity(entityKey)
      expect(after.$expiresAt).toBeGreaterThan(before.$expiresAt)
      expect(after.$expiresAt).toBe(extended.expiresAt)
      console.log(`  EXTEND  ${before.$expiresAt} → ${after.$expiresAt}`)
    },
    { timeout: 120_000 },
  )

  test(
    "transferring an entity moves it to the new owner but keeps its creator",
    async () => {
      const newOwner = "0x1234567890abcdef1234567890abcdef12345678" as Hex
      const tag = `owner-${Date.now()}`

      const { entityKey } = await create(Probe, { tag })

      const transfer = await walletClient.changeOwnership({ entityKey, newOwner })
      await publicClient.waitForTransactionReceipt({ hash: transfer.txHash })

      const after = await publicClient.getEntity(entityKey)
      expect(after.$owner).toBe(getAddress(newOwner))
      expect(after.$creator).toBe(account.address)

      const byTag = eq("tag", str(tag))
      const keys = (builder: { fetch(): Promise<{ entities: readonly unknown[] }> }) =>
        builder.fetch().then((page) => page.entities)
      expect(
        await keys(publicClient.select({ $key: true }).from(Probe).where(byTag).ownedBy(newOwner)),
      ).toHaveLength(1)
      expect(
        await keys(
          publicClient.select({ $key: true }).from(Probe).where(byTag).ownedBy(account.address),
        ),
      ).toHaveLength(0)
      expect(
        await keys(
          publicClient.select({ $key: true }).from(Probe).where(byTag).createdBy(account.address),
        ),
      ).toHaveLength(1)
      console.log(`  OWNER  ownedBy follows the transfer, createdBy does not`)
    },
    { timeout: 120_000 },
  )

  test(
    "creation flags come back as they were set, and readonly is enforced",
    async () => {
      const { entityKey } = await create(
        Probe,
        { purpose: "readonly_test" },
        { flags: { readonly: true } },
      )

      const entity = await publicClient.getEntity(entityKey)
      expect(entity.$creationFlags).toEqual({
        readonly: true,
        permissionlessExtension: false,
        raw: 0b01,
      })

      await expect(
        walletClient.patchEntity(Probe, entityKey, { set: { purpose: "should_fail" } }),
      ).rejects.toThrow()

      const extended = await walletClient.extendEntity({
        entityKey,
        expiration: ExpirationTime.fromHours(2),
      })
      await publicClient.waitForTransactionReceipt({ hash: extended.txHash })
      console.log(`  FLAGS  readonly blocks a patch, still allows an extension`)
    },
    { timeout: 180_000 },
  )

  test(
    "a permanent entity is written with an expiry no chain will reach",
    async () => {
      const { entityKey, expiresAt } = await create(
        Probe,
        { purpose: "permanent_test", body: new Uint8Array() },
        { expiration: ExpirationTime.permanent() },
      )

      expect(expiresAt).toBe(2n ** 64n - 1n)
      expect((await publicClient.getEntity(entityKey)).$expiresAt).toBe(2n ** 64n - 1n)
      console.log(`  EXPIRY  permanent entity stored at ${expiresAt}`)
    },
    { timeout: 120_000 },
  )

  test(
    "a batch applies every one of its operations, or none",
    async () => {
      const tag = `batch-${Date.now()}`
      const pre = await walletClient.executeBatch({
        creates: (["patch", "delete", "extend", "transfer"] as const).map((purpose) => ({
          schema: Probe,
          values: { tag, purpose: `batch_${purpose}`, body: json({ batch: purpose }) },
          expiration: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: pre.txHash })

      const [toPatch, toDelete, toExtend, toTransfer] = pre.createdEntities
      if (!toPatch || !toDelete || !toExtend || !toTransfer) {
        throw new Error(`expected 4 pre-created keys, got ${pre.createdEntities.length}`)
      }
      const expiryBefore = (await publicClient.getEntity(toExtend)).$expiresAt

      const newOwner = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Hex
      const result = await walletClient.executeBatch({
        creates: [
          {
            schema: Probe,
            values: { tag, purpose: "batch_created", body: json({ batch: "created" }) },
            expiration: SHORT,
          },
        ],
        patches: [{ schema: Probe, entityKey: toPatch, set: { purpose: "batch_patched" } }],
        deletes: [{ entityKey: toDelete }],
        extensions: [{ entityKey: toExtend, expiration: ExpirationTime.fromHours(2) }],
        ownershipChanges: [{ entityKey: toTransfer, newOwner }],
      })
      await publicClient.waitForTransactionReceipt({ hash: result.txHash })

      const created = result.createdEntities[0]
      if (!created) throw new Error("batch reported no created entity")
      expect((await publicClient.getEntity(created, Probe)).purpose).toEqual(str("batch_created"))
      expect((await publicClient.getEntity(toPatch, Probe)).purpose).toEqual(str("batch_patched"))
      await expect(publicClient.getEntity(toDelete)).rejects.toThrow(NoEntityFoundError)
      expect((await publicClient.getEntity(toExtend)).$expiresAt).toBeGreaterThan(expiryBefore)
      expect((await publicClient.getEntity(toTransfer)).$owner).toBe(getAddress(newOwner))
      console.log(`  BATCH  all five kinds applied in one transaction`)
    },
    { timeout: 240_000 },
  )

  test(
    "the keys a batch will mint can be worked out before it is sent",
    async () => {
      const tag = `predicted-${Date.now()}`
      const Tree = defineSchema({
        tag: str().indexed(),
        role: str().indexed(),
        parent: key().indexed().optional(),
      })
      const nonceBefore = await publicClient.getEntityNonce(account.address)

      // A literal count is a tuple, so the pairs destructure into names — no length check needed.
      const [parent, child] = await publicClient.predictEntityKeys({
        owner: account.address,
        count: 2,
      })
      expect(parent.key).not.toBe(child.key)

      // The second entity points at the first, whose key does not exist yet — which is the whole
      // reason to predict one.
      const batch = await walletClient.executeBatch({
        creates: [
          { schema: Tree, values: { tag, role: "parent" }, expiration: SHORT, salt: parent.salt },
          {
            schema: Tree,
            values: { tag, role: "child", parent: key(parent.key) },
            expiration: SHORT,
            salt: child.salt,
          },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: batch.txHash })

      // The engine minted exactly the keys that were predicted, in order.
      expect(batch.createdEntities).toEqual([parent.key, child.key])
      expect((await publicClient.getEntity(parent.key, Tree)).role).toEqual(str("parent"))

      // And the pointer the child was created with resolves to a real entity.
      const children = await publicClient
        .select({ $key: true, parent: true })
        .from(Tree)
        .where(and(eq("tag", str(tag)), eq("role", str("child"))))
        .fetch()
      expect(children.entities.map((row) => row.parent)).toEqual([key(parent.key)])

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
      const Scores = defineSchema({ group: str().indexed(), score: i32().indexed() })

      const created = await walletClient.executeBatch({
        creates: [10, 20, 30, 40, 50].map((score) => ({
          schema: Scores,
          values: { group, score: i32(score) },
          expiration: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (...predicates: Expression[]) =>
        (
          await publicClient
            .select({ $key: true })
            .where(and(...predicates))
            .fetch()
        ).entities.length

      expect(await count(inGroup, eq("score", i32(30)))).toBe(1)
      expect(await count(inGroup, gt("score", i32(30)))).toBe(2)
      expect(await count(inGroup, gte("score", i32(30)))).toBe(3)
      expect(await count(inGroup, lt("score", i32(30)))).toBe(2)
      expect(await count(inGroup, lte("score", i32(30)))).toBe(3)
      expect(await count(inGroup, or(eq("score", i32(10)), eq("score", i32(50))))).toBe(2)
      expect(await count(inGroup, and(gt("score", i32(10)), lt("score", i32(50))))).toBe(3)
      console.log(`  FILTER  every operator agreed with the data`)
    },
    { timeout: 180_000 },
  )

  test(
    "a projection returns exactly the fields it asked for",
    async () => {
      const tag = `proj-${Date.now()}`
      const Colored = defineSchema({ tag: str().indexed(), color: str(), body: bytes() })
      await create(Colored, { tag, color: "blue", body: json({ projection: true, tag }) })
      const where = eq("tag", str(tag))

      const keyOnly = await publicClient.select({ $key: true }).where(where).fetch()
      expect(keyOnly.entities[0]?.$key).toBeDefined()
      // @ts-expect-error owner was not selected
      expect(keyOnly.entities[0]?.$owner).toBeUndefined()
      // @ts-expect-error attributes were not selected
      expect(keyOnly.entities[0]?.$attributes).toBeUndefined()

      const bodyOnly = await publicClient.select({ body: true }).from(Colored).where(where).fetch()
      const body = bodyOnly.entities[0]?.body
      expect(body && JSON.parse(hexToString(body.value))).toMatchObject({ projection: true, tag })
      // @ts-expect-error color was not selected
      expect(bodyOnly.entities[0]?.color).toBeUndefined()

      const metadata = await publicClient
        .select({
          $owner: true,
          $creator: true,
          $createdAt: true,
          $updatedAt: true,
          $expiresAt: true,
          $creationFlags: true,
        })
        .where(where)
        .fetch()
      const meta = metadata.entities[0]
      if (!meta) throw new Error("no entity returned for metadata projection")
      expect(meta.$owner).toBeDefined()
      expect(meta.$creator).toBeDefined()
      expect(meta.$createdAt).toBeGreaterThan(0n)
      expect(meta.$updatedAt).toBeGreaterThan(0n)
      expect(meta.$expiresAt).toBeGreaterThan(0n)
      expect(meta.$creationFlags.readonly).toBe(false)
      // @ts-expect-error attributes were not selected
      expect(meta.$attributes).toBeUndefined()

      const schema = await publicClient.select({ $attributeSchema: true }).where(where).fetch()
      expect(schema.entities[0]?.$attributeSchema).toEqual({
        tag: { type: "str", indexed: true },
        color: { type: "str", indexed: false },
        body: { type: "bytes", indexed: false },
      })

      const oneAttribute = await publicClient
        .select({ $key: true, color: true })
        .where(where)
        .fetch()
      expect(oneAttribute.entities[0]?.color).toEqual(str("blue"))
      expect(oneAttribute.entities[0]).not.toHaveProperty("tag")

      const everything = await publicClient.select("*").from(Colored).where(where).fetch()
      expect(everything.entities[0]?.color).toEqual(str("blue"))
      expect(everything.entities[0]?.tag).toEqual(str(tag))
      expect(everything.entities[0]?.$owner).toBe(account.address)
      console.log(`  SELECT  projections returned exactly what was asked for`)
    },
    { timeout: 180_000 },
  )

  test(
    "limit and offset take consecutive windows of a sorted result",
    async () => {
      const group = `page-${Date.now()}`
      const Paged = defineSchema({ group: str().indexed(), index: i32() })
      const created = await walletClient.executeBatch({
        creates: Array.from({ length: 8 }, (_, index) => ({
          schema: Paged,
          values: { group, index },
          expiration: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const page = (offset: number) =>
        publicClient
          .select({ $key: true, index: true })
          .from(Paged)
          .where(eq("group", str(group)))
          .orderBy(asc("$key"))
          .limit(3)
          .offset(offset)
          .fetch()

      // A block lands between pages: each page reads the latest block, and an offset, unlike a
      // cursor, does not expire. Nothing writes to this group meanwhile, so the windows line up.
      const pages = [await page(0)]
      for (const offset of [3, 6, 9]) {
        await new Promise((resolve) => setTimeout(resolve, 2_500))
        pages.push(await page(offset))
      }
      expect(pages.map((p) => p.entities.length)).toEqual([3, 3, 2, 0])
      // Never older. A node that mines only on transactions may not have moved on, which is fine.
      const [first, second] = pages.map((p) => p.blockNumber)
      expect(second).toBeGreaterThanOrEqual(first ?? 0n)

      const rows = pages.flatMap((p) => p.entities)
      expect(rows.map((row) => row.$key)).toEqual([...created.createdEntities].sort())
      expect(rows.map((row) => row.index.value).sort((a, b) => a - b)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7,
      ])
      console.log(`  PAGE  3 windows of a sorted result, read across blocks`)
    },
    { timeout: 180_000 },
  )

  test(
    "every attribute type round-trips and stays queryable",
    async () => {
      const tag = `attrs-${Date.now()}`
      const dangling = `0x${"ab".repeat(32)}` as Hex
      const huge = 2n ** 200n
      const AllTypes = defineSchema({
        tag: str().indexed(),
        text: str().indexed(),
        count: i32().indexed(),
        zero: i32().indexed(),
        negative: i32().indexed(),
        big: u64().indexed(),
        amount: u256().indexed(),
        score: dec().indexed(),
        flagged: bool().indexed(),
        multiline: str().indexed(),
        who: addr().indexed(),
        parent: key().indexed(),
        blob: bytes(),
      })

      const { entityKey } = await create(AllTypes, {
        tag,
        text: "hello",
        count: 42,
        zero: 0,
        negative: i32(-10),
        big: u64(BigInt(Number.MAX_SAFE_INTEGER)),
        amount: u256(huge),
        score: dec("3.5"),
        flagged: true,
        multiline: "line one\n\tline two",
        who: addr(account.address),
        parent: key(dangling),
        blob: new Uint8Array([1, 2, 3]),
      })

      const entity = await publicClient.getEntity(entityKey, AllTypes)
      expect(entity.text).toEqual(str("hello"))
      expect(entity.count).toEqual(i32(42))
      expect(entity.zero).toEqual(i32(0))
      expect(entity.negative).toEqual(i32(-10))
      expect(entity.big).toEqual(u64(BigInt(Number.MAX_SAFE_INTEGER)))
      expect(entity.amount).toEqual(u256(huge))
      expect(entity.score).toEqual(dec("3.5"))
      expect(entity.flagged).toEqual(bool(true))
      expect(entity.multiline).toEqual(str("line one\n\tline two"))
      expect(entity.who).toEqual(addr(account.address))
      expect(entity.parent).toEqual(key(dangling))
      expect(entity.blob).toEqual(bytes("0x010203"))

      const shape = await publicClient
        .select({ $attributeSchema: true })
        .where(eq("$key", key(entityKey)))
        .fetch()
      expect(shape.entities[0]?.$attributeSchema).toMatchObject({
        text: { type: "str", indexed: true },
        count: { type: "i32", indexed: true },
        big: { type: "u64", indexed: true },
        amount: { type: "u256", indexed: true },
        score: { type: "dec", indexed: true },
        flagged: { type: "bool", indexed: true },
        multiline: { type: "str", indexed: true },
        who: { type: "addr", indexed: true },
        parent: { type: "key", indexed: true },
        blob: { type: "bytes", indexed: false },
      })

      const byTag = eq("tag", str(tag))
      const matches = async (predicate: Expression) =>
        (await publicClient.select({ $key: true }).where(byTag, predicate).fetch()).entities.length

      expect(await matches(eq("count", i32(42)))).toBe(1)
      expect(await matches(eq("big", u64(BigInt(Number.MAX_SAFE_INTEGER))))).toBe(1)
      expect(await matches(eq("amount", u256(huge)))).toBe(1)
      expect(await matches(eq("score", dec("3.5")))).toBe(1)
      expect(await matches(eq("who", addr(account.address)))).toBe(1)
      expect(await matches(eq("parent", key(dangling)))).toBe(1)
      expect(await matches(eq("multiline", "line one\n\tline two"))).toBe(1)
      expect(await matches(startsWith("multiline", "line one\n"))).toBe(1)

      expect(await matches(gt("score", dec("3.4999")))).toBe(1)
      expect(await matches(lt("score", dec("3.4999")))).toBe(0)
      expect(await matches(gte("amount", u256(huge)))).toBe(1)
      expect(await matches(gt("amount", u256(huge)))).toBe(0)
      expect(await matches(lt("negative", i32(0)))).toBe(1)
      console.log(`  ATTRS  every type round-tripped, matched and ordered`)
    },
    { timeout: 180_000 },
  )

  test(
    "unindexed columns are stored and selectable, but never match a filter",
    async () => {
      const tag = `unindexed-${Date.now()}`
      const Articles = defineSchema({
        tag: str().indexed(),
        title: str(),
        cover: bytes(),
        thumbnail: bytes(),
        lang: str().default("en"),
      })
      const { entityKey } = await create(Articles, {
        tag,
        title: "Cells, not entities",
        cover: new Uint8Array(32 * 1024).fill(7),
        thumbnail: new Uint8Array([9, 9]),
      })

      const row = (
        await publicClient
          .select({ $key: true, title: true, thumbnail: true, lang: true })
          .from(Articles)
          .where(eq("tag", tag))
          .fetch()
      ).entities[0]
      expect(row).toEqual({
        $key: entityKey,
        title: str("Cells, not entities"),
        thumbnail: bytes("0x0909"),
        lang: str("en"),
      })

      // There is no index to answer a filter on `title` from: the node refuses it or finds nothing.
      const byTitle = await publicClient
        .query(`tag = str('${tag}') AND title = str('Cells, not entities')`, {
          select: { $key: true },
        })
        .then((page) => page.entities.map((entity) => entity.$key))
        .catch(() => [])
      expect(byTitle).not.toContain(entityKey)
      console.log(`  COLUMNS  unindexed columns and two blobs stored, read back, never matched`)
    },
    { timeout: 120_000 },
  )

  test(
    "a raw query string works for a query built elsewhere",
    async () => {
      const tag = `raw-${Date.now()}`
      const Status = defineSchema({ tag: str().indexed(), status: str().indexed(), body: bytes() })
      const { entityKey } = await create(Status, {
        tag,
        status: "active",
        body: json({ rawQuery: true, tag }),
      })

      const result = await publicClient.query(`tag = str('${tag}') AND status = str('active')`, {
        select: { $key: true, body: true },
      })
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0]?.$key).toBe(entityKey)
      expect(result.entities[0]?.body?.type).toBe("bytes")

      const other = await publicClient.query(`tag = str('${tag}') AND status = str('archived')`, {
        select: { $key: true },
      })
      expect(other.entities).toHaveLength(0)
      console.log(`  RAW  raw query matched, and a different status did not`)
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
        // Let the watcher's first poll set up its filter, or these writes may land before it.
        await new Promise((r) => setTimeout(r, 3_000))
        const { entityKey } = await create(Probe, { purpose: "event_test" })

        const patch = await walletClient.patchEntity(Probe, entityKey, {
          set: { purpose: "event_test_patched" },
        })
        await publicClient.waitForTransactionReceipt({ hash: patch.txHash })

        const extend = await walletClient.extendEntity({
          entityKey,
          expiration: ExpirationTime.fromHours(2),
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
    "the count reflects what is stored",
    async () => {
      const owned = () => publicClient.count().ownedBy(account.address).fetch()
      const before = await owned()
      await create(Probe, { purpose: "count_test" })

      const after = await owned()
      expect(after).toBeGreaterThan(before)
      console.log(`  COUNT  ${before} → ${after}`)
    },
    { timeout: 120_000 },
  )

  test(
    "STARTSWITH matches a string prefix",
    async () => {
      const group = `prefix-${Date.now()}`
      const Labels = defineSchema({ group: str().indexed(), label: str().indexed() })
      const created = await walletClient.executeBatch({
        creates: ["alpha-one", "alpha-two", "beta-one"].map((label) => ({
          schema: Labels,
          values: { group, label },
          expiration: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ $key: true }).where(inGroup, predicate).fetch()).entities
          .length

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
      const Reviews = defineSchema({ group: str().indexed(), reviewed: str().indexed().optional() })
      const created = await walletClient.executeBatch({
        creates: [
          { schema: Reviews, values: { group, reviewed: "yes" }, expiration: SHORT },
          { schema: Reviews, values: { group, reviewed: "no" }, expiration: SHORT },
          { schema: Reviews, values: { group }, expiration: SHORT },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ $key: true }).where(inGroup, predicate).fetch()).entities
          .length

      // Both values count as present, whatever they hold; only the entity without one is left out.
      expect(await count(exists("reviewed"))).toBe(2)
      expect(await count(eq("reviewed", "yes"))).toBe(1)
      expect(await count(exists("neverwritten"))).toBe(0)
      console.log(`  EXISTS  presence answered, whatever the value`)
    },
    { timeout: 180_000 },
  )

  test(
    "TYPEOF tells apart one name written with two types",
    async () => {
      const group = `typeof-${Date.now()}`
      // Two schemas that disagree about the type of `reading` — legal, since the node sees only
      // attributes, and exactly what TYPEOF exists to tell apart.
      const Numeric = defineSchema({ group: str().indexed(), reading: i32().indexed() })
      const Textual = defineSchema({ group: str().indexed(), reading: str().indexed() })
      const created = await walletClient.executeBatch({
        creates: [
          { schema: Numeric, values: { group, reading: i32(1) }, expiration: SHORT },
          { schema: Textual, values: { group, reading: str("1") }, expiration: SHORT },
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const inGroup = eq("group", str(group))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ $key: true }).where(inGroup, predicate).fetch()).entities
          .length

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
      const { entityKey } = await create(Probe, { tag })

      const { $expiresAt: expiresAt } = await publicClient.getEntity(entityKey)

      const byTag = eq("tag", str(tag))
      const count = async (predicate: Expression) =>
        (await publicClient.select({ $key: true }).where(byTag, predicate).fetch()).entities.length

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
    "a rejected query says which kind of rejection it was",
    async () => {
      const group = `errors-${Date.now()}`
      const Grouped = defineSchema({ group: str().indexed() })
      const created = await walletClient.executeBatch({
        creates: [1, 2].map(() => ({ schema: Grouped, values: { group }, expiration: SHORT })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })

      const kindOf = async (query: string) => {
        try {
          await publicClient.query(query, { select: { $key: true } })
          return "accepted"
        } catch (error) {
          return error instanceof QueryError ? error.kind : `not a QueryError: ${String(error)}`
        }
      }

      expect(await kindOf(`group = = str('${group}')`)).toBe("parse")
      expect(await kindOf(`group = str('${group}') AND rank = i32(2147483648)`)).toBe("literal")
      expect(await kindOf("(".repeat(200))).toBe("limits")
      expect(await kindOf(`group = str('${group}') AND $owner = i32(5)`)).toBe("type")

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
      await expect(walletClient.patchEntity(Probe, absent, { set })).rejects.toThrow(/no entity/)

      // Not yours to patch: ownership moved, and with it the right to change the contents.
      const { entityKey } = await create(Probe, { purpose: "auth_test" })
      const transfer = await walletClient.changeOwnership({
        entityKey,
        newOwner: "0x00000000000000000000000000000000000000aa" as Hex,
      })
      await publicClient.waitForTransactionReceipt({ hash: transfer.txHash })
      await expect(walletClient.patchEntity(Probe, entityKey, { set })).rejects.toThrow(/owned by/)

      // Lifetimes never shorten. The engine resolves the pair the SDK sends against the block the
      // transaction lands in, so this is its judgement, not the SDK's.
      const { entityKey: liveKey } = await create(Probe, { purpose: "shorten_test" })
      await expect(
        walletClient.extendEntity({ entityKey: liveKey, expiration: ExpirationTime.fromBlocks(1) }),
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
      const Names = defineSchema({
        tag: str().indexed(),
        lowercase: str().indexed(),
        Uppercase: str().indexed(),
        MiXeDcAsE: str().indexed(),
        with9digits: str().indexed(),
        "dotted.name": str().indexed(),
        "dashed-name": str().indexed(),
        under_scored: str().indexed(),
        [longest]: str().indexed(),
        // Names are case-sensitive, so these are two attributes, not one written twice.
        Level: i32().indexed(),
        level: i32().indexed(),
      })
      const { entityKey } = await create(Names, {
        tag,
        lowercase: str("a"),
        Uppercase: str("b"),
        MiXeDcAsE: str("c"),
        with9digits: str("d"),
        "dotted.name": str("e"),
        "dashed-name": str("f"),
        under_scored: str("g"),
        [longest]: str("h"),
        Level: i32(1),
        level: i32(2),
      })

      const { $attributes: attributes } = await publicClient.getEntity(entityKey)
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
        (await publicClient.select({ $key: true }).where(byTag, predicate).fetch()).entities.length

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
      const { entityKey } = await create(Probe, { purpose: "atomic_original" })

      // One good operation and one impossible one
      await expect(
        walletClient.executeBatch({
          patches: [{ schema: Probe, entityKey, set: { purpose: "atomic_changed" } }],
          deletes: [{ entityKey: `0x${"88".repeat(32)}` as Hex }],
        }),
      ).rejects.toThrow()

      expect((await publicClient.getEntity(entityKey, Probe)).purpose).toEqual(
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
        // Let the watcher's first poll set up its filter, or these writes may land before it.
        await new Promise((r) => setTimeout(r, 3_000))
        const base = { schema: Probe, expiration: SHORT }
        const created = await walletClient.executeBatch({
          creates: [
            { ...base, values: { purpose: "handler_test", body: json({ role: "mutated" }) } },
            { ...base, values: { purpose: "handler_test", body: json({ role: "transferred" }) } },
          ],
        })
        await publicClient.waitForTransactionReceipt({ hash: created.txHash })
        const [mutated, transferred] = created.createdEntities
        if (!mutated || !transferred) throw new Error("expected two created keys")

        const patch = await walletClient.patchEntity(Probe, mutated, {
          set: { purpose: "handler_patched" },
        })
        await publicClient.waitForTransactionReceipt({ hash: patch.txHash })
        const extend = await walletClient.extendEntity({
          entityKey: mutated,
          expiration: ExpirationTime.fromHours(2),
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
    "a watcher delivers each event once, across blocks",
    async () => {
      const seen: { at: string; entityKey: Hex }[] = []
      const unwatch = publicClient.watchEntityEvents({
        onEntityCreated: (event) =>
          seen.push({ at: `${event.blockNumber}:${event.logIndex}`, entityKey: event.entityKey }),
        onError: (error) => console.log(`  WATCH  error: ${error.message}`),
      })

      try {
        // The watcher starts listening on its first poll, not when the call returns. Write before
        // that and the create is never delivered, so give it a few polls first.
        await new Promise((r) => setTimeout(r, 3_000))
        const { entityKey } = await create(Probe, { purpose: "once_test" })

        const deadline = Date.now() + 60_000
        while (Date.now() < deadline && !seen.some((e) => e.entityKey === entityKey)) {
          await new Promise((r) => setTimeout(r, 2_000))
        }
        expect(seen.map((e) => e.entityKey)).toContain(entityKey)

        // Keep watching across a few more blocks.
        await new Promise((r) => setTimeout(r, 10_000))
        expect(new Set(seen.map((e) => e.at)).size).toBe(seen.length)
        console.log(`  ONCE  ${seen.length} create(s) seen, none twice`)
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
      const Rows = defineSchema({
        group: str().indexed(),
        id: i32().indexed(),
        color: str().indexed().optional(),
        flag: bool().indexed().optional(),
      })
      const created = await walletClient.executeBatch({
        creates: rows.map((row) => ({
          schema: Rows,
          values: { group, ...row },
          expiration: SHORT,
        })),
      })
      await publicClient.waitForTransactionReceipt({ hash: created.txHash })
      expect(created.createdEntities).toHaveLength(rows.length)

      const inGroup = eq("group", str(group))

      const cases: { query: Expression<SchemaRef<typeof Rows>>; expected: number[] }[] = [
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
          // (green OR blue) AND not flagged. Row 9 sets neither, so matches neither.
          query: and(or(eq("color", str("green")), eq("color", str("blue"))), eq("flag", false)),
          expected: [1, 5, 7],
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
          // id >= 1 AND ((red AND not flagged) OR (green AND flagged) OR id = 9)
          query: and(
            gte("id", i32(1)),
            or(
              and(eq("color", str("red")), eq("flag", false)),
              and(eq("color", str("green")), eq("flag", true)),
              eq("id", i32(9)),
            ),
          ),
          expected: [3, 4, 9],
        },
        {
          // (id < 3 AND (flagged OR green)) OR (id >= 7 AND (blue OR id = 9))
          query: or(
            and(lt("id", i32(3)), or(eq("flag", true), eq("color", str("green")))),
            and(gte("id", i32(7)), or(eq("color", str("blue")), eq("id", i32(9)))),
          ),
          expected: [0, 1, 2, 8, 9],
        },
        {
          // id >= 7 AND not flagged
          query: and(gte("id", i32(7)), eq("flag", false)),
          expected: [7],
        },
      ]

      for (const { query, expected } of cases) {
        const page = await publicClient
          .select({ id: true })
          .from(Rows)
          .where(inGroup, query)
          .limit(100)
          .fetch()
        const ids = page.entities.map((row) => row.id.value).sort((a, b) => a - b)
        expect({ query: String(query), ids }).toEqual({ query: String(query), ids: expected })
      }
      console.log(`  NESTED  ${cases.length} nested queries returned exactly the expected ids`)
    },
    { timeout: 240_000 },
  )
})
