import { describe, expect, test } from "bun:test";
import type {
  Hex,
  PublicArkivClient,
  WalletArkivClient,
} from "@arkiv-network/sdk";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isHex,
  NoEntityFoundError,
} from "@arkiv-network/sdk";
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts";
import { kaolin, mendoza, rosario } from "@arkiv-network/sdk/chains";
import { and, eq, gt, gte, lt, lte, neq, or } from "@arkiv-network/sdk/query";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY env var is required");
}

if (!isHex(PRIVATE_KEY)) {
  throw new Error("Malformed PRIVATE_KEY: must be a hex string");
}

const pebbly = defineChain({
  id: 60138453096,
  name: "Pebbly",
  network: "pebbly",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://pebbly.hoodi.arkiv.network/rpc"],
      webSocket: ["wss://pebbly.hoodi.arkiv.network/rpc/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Pebbly Arkiv Explorer",
      url: "https://explorer.pebbly.hoodi.arkiv.network",
      apiUrl: "https://explorer.pebbly.hoodi.arkiv.network/api",
    },
  },
  testnet: true,
});

const chains = { kaolin, mendoza, rosario, pebbly } as const;
const chainName = (process.env.CHAIN ?? "kaolin") as keyof typeof chains;
const chain = chains[chainName];
if (!chain) {
  throw new Error(
    `Unknown chain: ${chainName}. Valid options: ${Object.keys(chains).join(", ")}`,
  );
}

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient: PublicArkivClient = createPublicClient({
  chain,
  transport: http(),
});

const walletClient: WalletArkivClient = createWalletClient({
  chain,
  transport: http(),
  account,
});

describe(`Network health check (${chain.name})`, () => {
  test(
    "chain is reachable - getChainId & getBlockNumber",
    async () => {
      const chainId = await publicClient.getChainId();
      expect(chainId).toBe(chain.id);

      const blockNumber = await publicClient.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0n);
    },
    { timeout: 30_000 },
  );

  test(
    "getBlockTiming returns valid data",
    async () => {
      const timing = await publicClient.getBlockTiming();
      expect(timing.currentBlock).toBeGreaterThan(0n);
      expect(timing.currentBlockTime).toBeGreaterThan(0);
      expect(timing.blockDuration).toBeGreaterThan(0);
    },
    { timeout: 30_000 },
  );

  test(
    "full CRUD lifecycle",
    async () => {
      const tag = `health-${Date.now()}`;

      // CREATE
      const payload = jsonToPayload({
        healthCheck: true,
        timestamp: new Date().toISOString(),
        tag,
      });

      const { entityKey, txHash: createTx } = await walletClient.createEntity({
        payload,
        contentType: "application/json",
        attributes: [
          { key: "healthcheck", value: "true" },
          { key: "tag", value: tag },
        ],
        expiresIn: ExpirationTime.fromHours(1),
      });

      expect(entityKey).toBeDefined();
      expect(createTx).toBeDefined();
      console.log(`  CREATE  entityKey=${entityKey}  tx=${createTx}`);

      // READ
      const created = await publicClient.getEntity(entityKey);
      expect(created).toBeDefined();
      expect(created.key).toBe(entityKey);
      expect(created.payload).toEqual(payload);
      expect(created.attributes).toContainEqual({ key: "tag", value: tag });
      expect(created.creator).toBeDefined();
      console.log(`  READ    entity found after create`);

      // QUERY
      const queryResult = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .ownedBy(account.address)
        .withPayload(true)
        .withAttributes(true)
        .fetch();

      expect(queryResult.entities.length).toBe(1);
      expect(queryResult.entities[0].key).toBe(entityKey);
      console.log(`  QUERY   found 1 entity matching tag=${tag}`);

      // UPDATE
      const updatedPayload = jsonToPayload({
        healthCheck: true,
        timestamp: new Date().toISOString(),
        tag,
        updated: true,
      });

      const { entityKey: updatedKey, txHash: updateTx } =
        await walletClient.updateEntity({
          entityKey,
          payload: updatedPayload,
          contentType: "application/json",
          attributes: [
            { key: "healthcheck", value: "true" },
            { key: "tag", value: tag },
            { key: "updated", value: "true" },
          ],
          expiresIn: ExpirationTime.fromHours(1),
        });

      expect(updatedKey).toBe(entityKey);
      expect(updateTx).toBeDefined();
      console.log(`  UPDATE  tx=${updateTx}`);

      // READ (after update)
      const updated = await publicClient.getEntity(entityKey);
      expect(updated.payload).toEqual(updatedPayload);
      expect(updated.attributes).toContainEqual({
        key: "updated",
        value: "true",
      });
      console.log(`  READ    entity updated successfully`);

      // DELETE
      const { txHash: deleteTx } = await walletClient.deleteEntity({
        entityKey,
      });
      expect(deleteTx).toBeDefined();
      console.log(`  DELETE  tx=${deleteTx}`);

      // READ (after delete)
      try {
        await publicClient.getEntity(entityKey);
        // If we get here the entity still exists – that's unexpected
        throw new Error("Entity should have been deleted");
      } catch (err) {
        expect(err).toBeInstanceOf(NoEntityFoundError);
        console.log(`  READ    entity correctly gone after delete`);
      }
    },
    { timeout: 120_000 },
  );

  test(
    "entity expires after TTL",
    async () => {
      const tag = `ttl-${Date.now()}`;
      const ttlBlocks = 5;

      // Create entity with a very short TTL (5 blocks ≈ 10 seconds)
      const { entityKey } = await walletClient.createEntity({
        payload: jsonToPayload({ ttlTest: true, tag }),
        contentType: "application/json",
        attributes: [{ key: "tag", value: tag }],
        expiresIn: ExpirationTime.fromBlocks(ttlBlocks),
      });

      // Confirm it exists right after creation
      const entity = await publicClient.getEntity(entityKey);
      expect(entity).toBeDefined();
      expect(entity.key).toBe(entityKey);
      console.log(
        `  CREATE  entity with TTL of ${ttlBlocks} blocks, expiresAtBlock=${entity.expiresAtBlock}`,
      );

      // Wait for the entity to expire.
      const expiresAt = entity.expiresAtBlock;
      if (!expiresAt) {
        throw new Error("Entity does not have an expiresAtBlock");
      }
      const pollInterval = 3_000;
      const maxWait = 120_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        const currentBlock = await publicClient.getBlockNumber();
        console.log(
          `  WAIT    currentBlock=${currentBlock}  expiresAt=${expiresAt}`,
        );
        if (currentBlock > expiresAt) break;
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      // Verify the entity is gone
      try {
        await publicClient.getEntity(entityKey);
        throw new Error("Entity should have expired");
      } catch (err) {
        expect(err).toBeInstanceOf(NoEntityFoundError);
        console.log(`  EXPIRED entity correctly gone after TTL`);
      }
    },
    { timeout: 180_000 },
  );

  test(
    "extendEntity prolongs TTL",
    async () => {
      const { entityKey } = await walletClient.createEntity({
        payload: jsonToPayload({ extendTest: true }),
        contentType: "application/json",
        attributes: [{ key: "purpose", value: "extend_test" }],
        expiresIn: ExpirationTime.fromHours(1),
      });

      const before = await publicClient.getEntity(entityKey);
      console.log(`  EXTEND  expiresAtBlock before=${before.expiresAtBlock}`);

      const { entityKey: extendedKey, txHash } =
        await walletClient.extendEntity({
          entityKey,
          expiresIn: ExpirationTime.fromHours(2),
        });

      expect(extendedKey).toBeDefined();
      expect(txHash).toBeDefined();

      const after = await publicClient.getEntity(entityKey);
      console.log(`  EXTEND  expiresAtBlock after=${after.expiresAtBlock}`);
      const beforeExpiry = before.expiresAtBlock ?? 0n;
      expect(after.expiresAtBlock).toBeGreaterThan(beforeExpiry);
    },
    { timeout: 60_000 },
  );

  test(
    "changeOwnership transfers entity to new owner",
    async () => {
      const newOwner = "0x1234567890abcdef1234567890abcdef12345678" as Hex;
      const tag = `ownership-${Date.now()}`;

      const { entityKey } = await walletClient.createEntity({
        payload: jsonToPayload({ ownershipTest: true }),
        contentType: "application/json",
        attributes: [
          { key: "purpose", value: "ownership_test" },
          { key: "tag", value: tag },
        ],
        expiresIn: ExpirationTime.fromHours(1),
      });

      // confirm initial owner
      const before = await publicClient.getEntity(entityKey);
      expect(before.owner?.toLowerCase()).toBe(account.address.toLowerCase());
      expect(before.creator?.toLowerCase()).toBe(account.address.toLowerCase());
      console.log(
        `  OWNER   before=${before.owner}  creator=${before.creator}`,
      );

      // createdBy query should find the entity before transfer
      const createdByBefore = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .createdBy(account.address)
        .fetch();
      expect(createdByBefore.entities.length).toBe(1);
      expect(createdByBefore.entities[0].key).toBe(entityKey);
      console.log(`  QUERY   createdBy matches before transfer`);

      const { txHash } = await walletClient.changeOwnership({
        entityKey,
        newOwner,
      });
      expect(txHash).toBeDefined();

      const after = await publicClient.getEntity(entityKey);
      expect(after.owner?.toLowerCase()).toBe(newOwner.toLowerCase());
      // creator should remain the original account even after ownership transfer
      expect(after.creator?.toLowerCase()).toBe(account.address.toLowerCase());
      console.log(`  OWNER   after=${after.owner}  creator=${after.creator}`);

      // after ownership transfer, createdBy should still return the entity
      const createdByAfter = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .createdBy(account.address)
        .fetch();
      expect(createdByAfter.entities.length).toBe(1);
      expect(createdByAfter.entities[0].key).toBe(entityKey);
      console.log(`  QUERY   createdBy still matches after ownership transfer`);

      // ownedBy with the original owner should no longer return the entity
      const ownedByOriginal = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .ownedBy(account.address)
        .fetch();
      expect(ownedByOriginal.entities.length).toBe(0);
      console.log(
        `  QUERY   ownedBy original owner correctly returns 0 after transfer`,
      );

      // ownedBy with the new owner should return the entity
      const ownedByNew = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .ownedBy(newOwner)
        .fetch();
      expect(ownedByNew.entities.length).toBe(1);
      expect(ownedByNew.entities[0].key).toBe(entityKey);
      console.log(`  QUERY   ownedBy new owner returns entity after transfer`);
    },
    { timeout: 60_000 },
  );

  test(
    "mutateEntities batch: create, update, delete, extend in one tx",
    async () => {
      // pre-create entities to update, delete, extend, change owner
      const { createdEntities } = await walletClient.mutateEntities({
        creates: [
          {
            // to update
            payload: jsonToPayload({ batch: "update" }),
            contentType: "application/json",
            attributes: [{ key: "purpose", value: "batch_update" }],
            expiresIn: ExpirationTime.fromHours(1),
          },
          {
            // to delete
            payload: jsonToPayload({ batch: "delete" }),
            contentType: "application/json",
            attributes: [{ key: "purpose", value: "batch_delete" }],
            expiresIn: ExpirationTime.fromHours(1),
          },
          {
            // to extend
            payload: jsonToPayload({ batch: "extend" }),
            contentType: "application/json",
            attributes: [{ key: "purpose", value: "batch_extend" }],
            expiresIn: ExpirationTime.fromHours(1),
          },
          {
            // to change owner
            payload: jsonToPayload({ batch: "change_owner" }),
            contentType: "application/json",
            attributes: [{ key: "purpose", value: "batch_change_owner" }],
            expiresIn: ExpirationTime.fromHours(1),
          },
        ],
      });

      const [toUpdateKey, toDeleteKey, toExtendKey, toChangeOwnerKey] =
        createdEntities;
      if (!toUpdateKey || !toDeleteKey || !toExtendKey || !toChangeOwnerKey) {
        throw new Error(
          `Failed to pre-create entities for batch mutateEntities test, expected 4 keys but got: ${createdEntities.length}`,
        );
      }

      const result = await walletClient.mutateEntities({
        creates: [
          {
            payload: jsonToPayload({ batch: "create_new" }),
            contentType: "application/json",
            attributes: [{ key: "purpose", value: "batch_create" }],
            expiresIn: ExpirationTime.fromHours(1),
          },
        ],
        updates: [
          {
            entityKey: toUpdateKey,
            payload: jsonToPayload({ batch: "updated", updated: true }),
            contentType: "application/json",
            attributes: [{ key: "purpose", value: "batch_updated" }],
            expiresIn: ExpirationTime.fromHours(1),
          },
        ],
        deletes: [{ entityKey: toDeleteKey }],
        extensions: [
          {
            entityKey: toExtendKey,
            expiresIn: ExpirationTime.fromHours(2),
          },
        ],
        ownershipChanges: [
          {
            entityKey: toChangeOwnerKey,
            newOwner: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Hex,
          },
        ],
      });

      expect(result.txHash).toBeDefined();
      expect(result.createdEntities).toHaveLength(1);
      expect(result.updatedEntities).toHaveLength(1);
      expect(result.deletedEntities).toHaveLength(1);
      expect(result.extendedEntities).toHaveLength(1);
      expect(result.ownershipChanges).toHaveLength(1);
      console.log(`  BATCH   tx=${result.txHash}`);

      // verify the deleted entity is gone
      try {
        await publicClient.getEntity(toDeleteKey);
        throw new Error("Deleted entity should not exist");
      } catch (err) {
        expect(err).toBeInstanceOf(NoEntityFoundError);
      }

      // verify the updated entity
      const updatedEntity = await publicClient.getEntity(toUpdateKey);
      expect(updatedEntity.attributes).toContainEqual({
        key: "purpose",
        value: "batch_updated",
      });

      // verify the extended entity's expiry is in the future
      const extendedEntity = await publicClient.getEntity(toExtendKey);
      const nowBlock = await publicClient.getBlockNumber();
      expect(extendedEntity.expiresAtBlock).toBeGreaterThan(nowBlock);

      // verify the ownership changed entity
      const changedEntity = await publicClient.getEntity(toChangeOwnerKey);
      expect(changedEntity.owner?.toLowerCase()).toBe(
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd".toLowerCase(),
      );
    },
    { timeout: 120_000 },
  );

  test(
    "query filtering: neq, gt, gte, lt, lte, and, or",
    async () => {
      const group = `filter-${Date.now()}`;

      // create entities with numeric scores
      await walletClient.mutateEntities({
        creates: [10, 20, 30, 40, 50].map((score) => ({
          payload: jsonToPayload({ group, score }),
          contentType: "application/json" as const,
          attributes: [
            { key: "group", value: group },
            { key: "score", value: score },
          ],
          expiresIn: ExpirationTime.fromHours(1),
        })),
      });

      // eq – only score=30
      const eqResult = await publicClient
        .buildQuery()
        .where([eq("group", group), eq("score", 30)])
        .withAttributes(true)
        .fetch();
      expect(eqResult.entities).toHaveLength(1);
      console.log(`  FILTER  eq: found ${eqResult.entities.length}`);

      // neq – everything except score=30 → 4 entities
      const neqResult = await publicClient
        .buildQuery()
        .where([eq("group", group), neq("score", 30)])
        .withAttributes(true)
        .fetch();
      expect(neqResult.entities).toHaveLength(4);
      console.log(`  FILTER  neq: found ${neqResult.entities.length}`);

      // gt – score > 30 → 40, 50
      const gtResult = await publicClient
        .buildQuery()
        .where([eq("group", group), gt("score", 30)])
        .withAttributes(true)
        .fetch();
      expect(gtResult.entities).toHaveLength(2);
      console.log(`  FILTER  gt: found ${gtResult.entities.length}`);

      // gte – score >= 30 → 30, 40, 50
      const gteResult = await publicClient
        .buildQuery()
        .where([eq("group", group), gte("score", 30)])
        .withAttributes(true)
        .fetch();
      expect(gteResult.entities).toHaveLength(3);
      console.log(`  FILTER  gte: found ${gteResult.entities.length}`);

      // lt – score < 30 → 10, 20
      const ltResult = await publicClient
        .buildQuery()
        .where([eq("group", group), lt("score", 30)])
        .withAttributes(true)
        .fetch();
      expect(ltResult.entities).toHaveLength(2);
      console.log(`  FILTER  lt: found ${ltResult.entities.length}`);

      // lte – score <= 30 → 10, 20, 30
      const lteResult = await publicClient
        .buildQuery()
        .where([eq("group", group), lte("score", 30)])
        .withAttributes(true)
        .fetch();
      expect(lteResult.entities).toHaveLength(3);
      console.log(`  FILTER  lte: found ${lteResult.entities.length}`);

      // or – score=10 OR score=50 → 2
      const orResult = await publicClient
        .buildQuery()
        .where([eq("group", group), or([eq("score", 10), eq("score", 50)])])
        .withAttributes(true)
        .fetch();
      expect(orResult.entities).toHaveLength(2);
      console.log(`  FILTER  or: found ${orResult.entities.length}`);

      // and – score > 10 AND score < 50 → 20, 30, 40
      const andResult = await publicClient
        .buildQuery()
        .where([eq("group", group), and([gt("score", 10), lt("score", 50)])])
        .withAttributes(true)
        .fetch();
      expect(andResult.entities).toHaveLength(3);
      console.log(`  FILTER  and: found ${andResult.entities.length}`);
    },
    { timeout: 120_000 },
  );

  test(
    "query projections: withAttributes, withMetadata, withPayload",
    async () => {
      const tag = `proj-${Date.now()}`;

      await walletClient.createEntity({
        payload: jsonToPayload({ projection: true, tag }),
        contentType: "application/json",
        attributes: [
          { key: "tag", value: tag },
          { key: "color", value: "blue" },
        ],
        expiresIn: ExpirationTime.fromHours(1),
      });

      // default (no projections) – only key
      const defaultResult = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .fetch();
      const e0 = defaultResult.entities[0];
      expect(e0.key).toBeDefined();
      expect(e0.payload).toBeUndefined();
      expect(e0.attributes).toHaveLength(0);
      expect(e0.expiresAtBlock).toBeUndefined();
      console.log(`  PROJ    default: key-only`);

      // payload only
      const payloadOnly = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .withPayload(true)
        .withAttributes(false)
        .withMetadata(false)
        .fetch();
      const e1 = payloadOnly.entities[0];
      expect(e1.payload?.length).toBeGreaterThan(0);
      expect(e1.expiresAtBlock).toBeUndefined();
      console.log(`  PROJ    payload-only`);

      // metadata only
      const metadataOnly = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .withMetadata(true)
        .withPayload(false)
        .withAttributes(false)
        .fetch();
      const e2 = metadataOnly.entities[0];
      expect(e2.owner).toBeDefined();
      expect(e2.creator).toBeDefined();
      expect(e2.expiresAtBlock).toBeDefined();
      expect(e2.createdAtBlock).toBeDefined();
      expect(e2.lastModifiedAtBlock).toBeDefined();
      expect(e2.payload).toBeUndefined();
      console.log(`  PROJ    metadata-only`);

      // attributes only
      const attrsOnly = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .withAttributes(true)
        .withPayload(false)
        .withMetadata(false)
        .fetch();
      const e3 = attrsOnly.entities[0];
      expect(e3.attributes.length).toBeGreaterThanOrEqual(1);
      expect(e3.payload).toBeUndefined();
      expect(e3.expiresAtBlock).toBeUndefined();
      console.log(`  PROJ    attributes-only`);

      // all projections
      const allProjections = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .withAttributes(true)
        .withMetadata(true)
        .withPayload(true)
        .fetch();
      const e4 = allProjections.entities[0];
      expect(e4.payload?.length).toBeGreaterThan(0);
      expect(e4.attributes.length).toBeGreaterThanOrEqual(1);
      expect(e4.owner).toBeDefined();
      expect(e4.creator).toBeDefined();
      expect(e4.expiresAtBlock).toBeDefined();
      console.log(`  PROJ    all projections`);
    },
    { timeout: 60_000 },
  );

  test(
    "query with pagination",
    async () => {
      const group = `page-${Date.now()}`;

      // create 8 entities
      await walletClient.mutateEntities({
        creates: Array.from({ length: 8 }, (_, i) => ({
          payload: jsonToPayload({ group, index: i }),
          contentType: "application/json" as const,
          attributes: [{ key: "group", value: group }],
          expiresIn: ExpirationTime.fromHours(1),
        })),
      });

      // fetch page 1 (limit 3)
      const page1 = await publicClient
        .buildQuery()
        .where(eq("group", group))
        .limit(3)
        .fetch();
      expect(page1.entities).toHaveLength(3);
      expect(page1.hasNextPage()).toBe(true);
      console.log(`  PAGE    1: ${page1.entities.length} entities`);

      // fetch page 2
      await page1.next();
      expect(page1.entities).toHaveLength(3);
      expect(page1.hasNextPage()).toBe(true);
      console.log(`  PAGE    2: ${page1.entities.length} entities`);

      // fetch page 3 (remaining 2)
      await page1.next();
      expect(page1.entities).toHaveLength(2);
      expect(page1.hasNextPage()).toBe(false);
      console.log(`  PAGE    3: ${page1.entities.length} entities`);

      // no more pages
      await expect(page1.next()).rejects.toThrow();
    },
    { timeout: 120_000 },
  );

  test(
    "query with ownedBy filter",
    async () => {
      const tag = `owner-${Date.now()}`;

      const { entityKey } = await walletClient.createEntity({
        payload: jsonToPayload({ ownerFilter: true, tag }),
        contentType: "application/json",
        attributes: [{ key: "tag", value: tag }],
        expiresIn: ExpirationTime.fromHours(1),
      });

      // query with correct owner
      const ownedResult = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .ownedBy(account.address)
        .fetch();
      expect(ownedResult.entities).toHaveLength(1);
      expect(ownedResult.entities[0].key).toBe(entityKey);
      console.log(
        `  OWNED   correct owner: found ${ownedResult.entities.length}`,
      );

      // query with wrong owner – should find nothing
      const wrongOwner = "0x0000000000000000000000000000000000000001" as Hex;
      const notOwnedResult = await publicClient
        .buildQuery()
        .where(eq("tag", tag))
        .ownedBy(wrongOwner)
        .fetch();
      expect(notOwnedResult.entities).toHaveLength(0);
      console.log(
        `  OWNED   wrong owner: found ${notOwnedResult.entities.length}`,
      );
    },
    { timeout: 60_000 },
  );

  test(
    "numeric and string attributes stored and queried correctly",
    async () => {
      const tag = `attrs-${Date.now()}`;

      const { entityKey } = await walletClient.createEntity({
        payload: jsonToPayload({ attrTest: true }),
        contentType: "application/json",
        attributes: [
          { key: "tag", value: tag },
          { key: "strAttr", value: "hello" },
          { key: "numAttr", value: 42 },
          { key: "zeroAttr", value: 0 },
        ],
        expiresIn: ExpirationTime.fromHours(1),
      });

      const entity = await publicClient.getEntity(entityKey);
      expect(entity.attributes).toContainEqual({
        key: "strAttr",
        value: "hello",
      });
      expect(entity.attributes).toContainEqual({ key: "numAttr", value: 42 });
      expect(entity.attributes).toContainEqual({ key: "zeroAttr", value: 0 });
      console.log(
        `  ATTRS   string, numeric, and zero attributes stored correctly`,
      );

      // query by numeric attribute
      const numQuery = await publicClient
        .buildQuery()
        .where([eq("tag", tag), eq("numAttr", 42)])
        .fetch();
      expect(numQuery.entities).toHaveLength(1);
      console.log(`  ATTRS   numeric query matched`);
    },
    { timeout: 60_000 },
  );

  test(
    "raw query string works",
    async () => {
      const tag = `raw-${Date.now()}`;

      const { entityKey } = await walletClient.createEntity({
        payload: jsonToPayload({ rawQuery: true, tag }),
        contentType: "application/json",
        attributes: [
          { key: "tag", value: tag },
          { key: "status", value: "active" },
        ],
        expiresIn: ExpirationTime.fromHours(1),
      });

      const result = await publicClient.query(
        `tag = "${tag}" && status = "active"`,
      );
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].key).toBe(entityKey);
      // raw query includes payload by default
      expect(result.entities[0].payload).toBeDefined();
      console.log(`  RAW     query matched 1 entity`);
    },
    { timeout: 60_000 },
  );
});
