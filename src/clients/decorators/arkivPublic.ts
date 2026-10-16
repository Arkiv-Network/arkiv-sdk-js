import type { Account, Address, Chain, Client, Hex, PublicActions, Transport } from "viem"
import { type GetBlockTimingReturnType, getBlockTiming } from "../../actions/public/getBlockTiming"
import { getEntity } from "../../actions/public/getEntity"
import { getEntityCount } from "../../actions/public/getEntityCount"
import { getEntityNonce } from "../../actions/public/getEntityNonce"
import {
  type PredictEntityKeysParameters,
  type PredictEntityKeysReturnType,
  predictEntityKeys,
} from "../../actions/public/predictEntityKeys"
import {
  type QueryOptions,
  type QueryReturnType,
  type QueryRow,
  query,
} from "../../actions/public/query"
import {
  type WatchEntityEventsParameters,
  watchEntityEvents,
} from "../../actions/public/watchEntityEvents"
import type { SaltInput } from "../../entity/key"
import type { Expression } from "../../query/expression"
import { SelectQueryBuilder } from "../../query/queryBuilder"
import type {
  FullEntity,
  FullRow,
  NonEmptySelection,
  PartialRow,
  SelectArg,
  SelectionOf,
} from "../../query/selection"
import type { Schema } from "../../schema"

export type PublicArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
> = Pick<
  PublicActions<transport, chain, account>,
  | "getBalance"
  | "getBlock"
  | "getBlockNumber"
  | "getChainId"
  | "getLogs"
  | "getTransaction"
  | "getTransactionCount"
  | "getTransactionReceipt"
  | "waitForTransactionReceipt"
  | "watchEvent"
> & {
  /**
   * Returns the entity with the given key.
   *
   * Given a schema, it is read through it: the result is a flat row of every entity field and
   * every column, each typed as the schema declares and checked against it.
   *
   * - JSON-RPC Methods: `arkiv_query`
   *
   * @param key - The entity key (hex string)
   * @param schema - Optionally, the schema to read the entity through.
   * @returns The entity with the given key, with every field populated — a {@link FullEntity}, or
   * a {@link FullRow} through a schema.
   *
   * @throws {InvalidValueError} If the key is not 32 bytes.
   * @throws {NoEntityFoundError} If no live entity has that key — it never existed, or it was
   * deleted or has expired.
   * @throws {SchemaMismatchError} If, given a schema, the entity does not fit it.
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * const entity = await client.getEntity(entityKey)
   * // {
   * //   key: "0x9f2c…",
   * //   owner: "0xabc…",
   * //   expiresAt: 1_297_000n,
   * //   attributes: { category: { type: "str", value: "docs" } },
   * //   ...
   * // }
   *
   * const post = await client.getEntity(entityKey, Posts)
   * // { key: "0x9f2c…", owner: "0xabc…", ..., category: { type: "str", value: "docs" }, ... }
   */
  getEntity: {
    (key: Hex): Promise<FullEntity>
    <S extends Schema>(key: Hex, schema: S): Promise<FullRow<S>>
  }

  /**
   * Returns a SelectQueryBuilder for building and executing queries — the recommended way to
   * read entities. You declare up front which parts of an entity you want returned, so results
   * always contain exactly the data you asked for.
   *
   * The selection names entity fields and attributes side by side, and each result is a flat row.
   * Chain `.from(schema)` to read through a schema: the selection keeps its meaning, but each
   * attribute comes back typed and checked as the schema declares, and `where` may only filter on
   * the schema's indexed columns.
   *
   * - JSON-RPC Methods: `arkiv_query`
   *
   * @param selection - What to include in the results. Omit it (or pass `"*"`) to select everything,
   *   or pass an object to select specific parts (at least one field is required). Every part is
   *   opt-in, including the `key`. The selection is flat — each field maps to a field of the result.
   *   {@link SelectArg}
   * @returns A SelectQueryBuilder instance for building and executing queries. {@link SelectQueryBuilder}
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { and, eq, gt } from "@arkiv-network/sdk/query"
   * import { dec } from "@arkiv-network/sdk/schema"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * // through a schema — rows typed { key: Hex; author: AddrValue; title: StrValue }
   * await client
   *   .select({ key: true, author: true, title: true })
   *   .from(Posts)
   *   .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
   *   .fetch()
   * // every field and column
   * await client.select().from(Posts).where(eq("category", "docs")).fetch()
   *
   * // the same selection without a schema — rows typed
   * // { key: Hex; author: ArkivValue | undefined; title: ArkivValue | undefined }
   * await client.select({ key: true, author: true, title: true }).where(eq("category", "docs")).fetch()
   */
  select: {
    /**
     * Select every field — and, through a schema, every column. Pass nothing or `"*"`.
     */
    (selection?: "*"): SelectQueryBuilder<"*">
    /**
     * Pick the fields to return. Set the ones you want to `true` (at least one is required); the
     * result is typed to exactly those fields, so reading anything else is a compile error.
     *
     * Entity fields: `key`, `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt` and
     * `creationFlags`. `attributes` reads the attributes as a map — `true` for all, or a map of
     * names for some — and `attributeSchema` their types and indexing. Any other name is an
     * attribute, read as a field of its own: untyped without a schema, and through one typed and
     * checked as the column it must be.
     *
     * Pass the selection inline so its fields stay literal `true`. A selection stored in a `let`/
     * `const` variable widens to `boolean`, and one typed {@link SelectArg} is only known at
     * runtime: which fields come back is then decided at runtime, so every field of the result is
     * optional — a {@link PartialRow}. Annotate a stored selection `as const` to keep it narrow.
     *
     * @example
     * client.select({ key: true, title: true })               // { key: Hex; title: ArkivValue | undefined }
     * client.select({ key: true, title: true }).from(Posts)  // { key: Hex; title: StrValue }
     * client.select({ owner: true, attributes: true })        // { owner: Hex; attributes: Attributes }
     * client.select({ key: true, attributeSchema: true })     // what shape is the data?
     */
    <const S extends SelectArg>(
      selection: S & NonEmptySelection<S>,
    ): SelectQueryBuilder<SelectionOf<S>>
  }

  /**
   * Runs one query and returns one page, with no builder in between.
   *
   * The selection means what it does in {@link PublicArkivActions.select}, and the results are the
   * same flat rows a query without a schema returns, typed from the selection. Use `select()` to
   * read through a schema. This also takes a raw string as an escape hatch for a query built
   * elsewhere. A raw string
   * goes to the node exactly as written, with none of the name, type or operator checks the
   * expression combinators apply.
   *
   * @param query - An {@link Expression}, or the raw query string.
   * @param queryOptions - Selection, page size, cursor and block. {@link QueryOptions}
   * @returns One page of entities. {@link QueryReturnType}
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { and, eq, gte } from "@arkiv-network/sdk/query"
   * import { i32 } from "@arkiv-network/sdk/schema"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * const page = await client.query(and(eq("category", "docs"), gte("level", i32(10))), {
   *   select: { key: true, title: true },
   *   limit: 100,
   * })
   * // { entities: [{ key: Hex; title: ArkivValue | undefined }], cursor: "b64:…", blockNumber: 32223n }
   *
   * // The raw form, unchecked:
   * await client.query("category = str('docs') AND level >= i32(10)")
   */
  query: <const S extends SelectArg = "*">(
    query: Expression | string,
    queryOptions?: QueryOptions<S>,
  ) => Promise<QueryReturnType<QueryRow<S>>>

  /**
   * Returns the total number of entities on the chain.
   * @returns The number of entities currently stored
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * const entityCount = await client.getEntityCount()
   * // entityCount = 0
   */
  getEntityCount: () => Promise<number>

  /**
   * Returns how many entities an account has created — its entity-minting nonce.
   *
   * Not the account's transaction nonce: the engine keeps its own counter per creator and mixes it
   * into every key it mints, which is why two identical creates from one account never collide.
   *
   * @param owner - The account whose nonce to read.
   * @returns The nonce the account's next create will use.
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * const nonce = await client.getEntityNonce("0xabc…")
   * // 7n — the next entity this account creates is its eighth
   */
  getEntityNonce: (owner: Address) => Promise<bigint>

  /**
   * Works out the keys an account's next creates will be given, before sending them.
   *
   * The engine derives a key from the chain, the registry, the owner, the owner's nonce and a
   * salt — everything but the nonce is known to the caller, and the nonce is read here. This is
   * what lets a batch reference an entity it is about to mint.
   *
   * Each key arrives paired with the salt that mints it, because a create defaults to a *random*
   * salt: a predicted key only holds if the create carries the salt it was predicted with. And the
   * prediction holds only while nothing else from this owner is in flight — for a key you can rely
   * on unconditionally, read it back from the create instead.
   *
   * A literal `count` comes back as a fixed-length tuple, so the pairs destructure into names.
   *
   * @param parameters - Owner, and either a count or the salts. {@link PredictEntityKeysParameters}
   * @returns One `{ key, salt }` pair per create, in batch order.
   *   {@link PredictEntityKeysReturnType}
   *
   * @example A batch whose second entity points at its first.
   * import { defineSchema, key, str } from "@arkiv-network/sdk/schema"
   *
   * const Nodes = defineSchema("nodes", { name: str(), parent: key().indexed().optional() })
   *
   * const [parent, child] = await client.predictEntityKeys({ owner: account.address, count: 2 })
   * await wallet.executeBatch({
   *   creates: [
   *     { schema: Nodes, values: { name: "root" }, expiration, salt: parent.salt },
   *     {
   *       schema: Nodes,
   *       values: { name: "leaf", parent: key(parent.key) },
   *       expiration,
   *       salt: child.salt,
   *     },
   *   ],
   * })
   */
  predictEntityKeys: <
    const TCount extends number = number,
    const TSalts extends readonly SaltInput[] | undefined = undefined,
  >(
    parameters: PredictEntityKeysParameters<TCount, TSalts>,
  ) => Promise<PredictEntityKeysReturnType<TCount, TSalts>>

  /**
   * Returns the current block timing.
   * @returns The current block timing. {@link GetBlockTimingReturnType}
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * const blockTiming = await client.getBlockTiming()
   * // {
   * //   currentBlock: 10n, // block number
   * //   currentBlockTime: 1234567890, // block timestamp
   * //   blockDuration: 2, // in seconds
   * // }
   */
  getBlockTiming: () => Promise<GetBlockTimingReturnType>

  /**
   * Watches entity events, calling the handlers you pass as they arrive.
   *
   * All five are decoded from logs — `onEntityCreated`, `onEntityPatched`, `onExpiryExtended`,
   * `onOwnershipTransferred`, `onEntityDeleted` — and each carries the block, transaction and log
   * index it came from, which is the order the operations were applied in. `onEvent` receives all
   * of them, whatever their type.
   *
   * @param parameters - Handlers and options, all optional. {@link WatchEntityEventsParameters}
   * @returns A function that stops the watcher.
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { tiramisu } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: tiramisu,
   *   transport: http(),
   * })
   * const unwatch = client.watchEntityEvents({
   *   onEntityCreated: ({ entityKey, expiresAt }) => console.log(entityKey, "until", expiresAt),
   *   onError: (error) => console.error("watchEntityEvents error", error),
   * })
   * unwatch() // stop watching
   */
  watchEntityEvents: (parameters: WatchEntityEventsParameters) => () => void
}

export function publicArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
  return {
    getEntity: ((key: Hex, schema?: Schema) =>
      getEntity(client, key, schema as Schema)) as PublicArkivActions["getEntity"],
    query: ((rawQuery: Expression | string, queryOptions?: QueryOptions) =>
      query(client, rawQuery, queryOptions)) as PublicArkivActions["query"],
    select: ((selection?: SelectArg) =>
      new SelectQueryBuilder(client, selection)) as PublicArkivActions["select"],
    getBlockTiming: () => getBlockTiming(client),
    getEntityCount: () => getEntityCount(client),
    getEntityNonce: (owner: Address) => getEntityNonce(client, owner),
    predictEntityKeys: <
      const TCount extends number = number,
      const TSalts extends readonly SaltInput[] | undefined = undefined,
    >(
      parameters: PredictEntityKeysParameters<TCount, TSalts>,
    ) => predictEntityKeys(client, parameters),
    watchEntityEvents: (parameters: WatchEntityEventsParameters) =>
      watchEntityEvents(client, parameters),
  }
}
