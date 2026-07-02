import type { Account, Chain, Client, Hex, PublicActions, Transport } from "viem"
import { getBlockTiming } from "../../actions/public/getBlockTiming"
import { getEntity } from "../../actions/public/getEntity"
import { getEntityCount } from "../../actions/public/getEntityCount"
import { type QueryOptions, type QueryReturnType, query } from "../../actions/public/query"
import { subscribeEntityEvents } from "../../actions/public/subscribeEntityEvents"
import { QueryBuilder, SelectQueryBuilder } from "../../query/queryBuilder"
import type { EntitySelection, FullEntity, ProjectedEntity, SelectArg } from "../../query/selection"
import type { Entity } from "../../types/entity"
import type {
  OnEntityCreatedEvent,
  OnEntityDeletedEvent,
  OnEntityExpiredEvent,
  OnEntityExpiresInExtendedEvent,
  OnEntityUpdatedEvent,
} from "../../types/events"

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
   * - Docs: https://docs.arkiv.network/ts-sdk/actions/public/getEntity
   *
   * @param key - The entity key (hex string)
   * @returns The entity with the given key. {@link Entity}
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const entity = await client.getEntity("0x123")
   * // {
   * //   key: "0x123",
   * //   value: "0x123",
   * // }
   */
  getEntity: (key: Hex) => Promise<Entity>

  /**
   * Returns a SelectQueryBuilder for building and executing queries — the recommended way to
   * read entities. You declare up front which parts of an entity you want returned, so results
   * always contain exactly the data you asked for.
   *
   * - Docs: https://docs.arkiv.network/ts-sdk/actions/public/query
   *
   * @param selection - What to include in the results. Omit it (or pass `"*"`) to select everything,
   *   or pass an object to select specific parts (at least one field is required). Every part is
   *   opt-in, including the `key`. The selection is flat — each field maps to an entity field.
   *   {@link SelectArg}
   * @returns A SelectQueryBuilder instance for building and executing queries. {@link SelectQueryBuilder}
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   * import { eq } from 'arkiv/query'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * // select everything
   * await client.select().where(eq("category", "docs")).fetch()
   * await client.select("*").where(eq("category", "docs")).fetch()
   * // only the key
   * await client.select({ key: true }).where(eq("category", "docs")).fetch()
   * // select specific fields — result typed { owner: Hex; attributes: Attribute[] }
   * await client.select({ owner: true, attributes: true }).fetch()
   * // a single field — result typed { owner: Hex }
   * await client.select({ owner: true }).fetch()
   */
  select: {
    /** Select every field. Pass nothing or `"*"`; the returned entities contain all fields. */
    (selection?: "*"): SelectQueryBuilder<FullEntity>
    /**
     * Pick the entity fields to return. Set the ones you want to `true` (at least one is required);
     * the result is typed to exactly those fields, so reading anything else is a compile error.
     *
     * Available fields: `key`, `owner`, `creator`, `contentType`, `payload`, `attributes`,
     * `expiresAtBlock`, `createdAtBlock`, `lastModifiedAtBlock`, `transactionIndexInBlock`,
     * `operationIndexInTransaction`.
     *
     * Pass the selection inline so its fields stay literal `true`. A selection stored in a `let`/
     * `const` variable widens to `boolean` and the result type can no longer be narrowed — annotate
     * it `as const` (e.g. `const sel = { owner: true } as const`) in that case.
     *
     * @example
     * client.select({ owner: true, attributes: true }) // entities typed { owner, attributes }
     * client.select({ key: true, payload: true })       // includes payload → toText()/toJson() too
     */
    <const S extends EntitySelection>(selection: S): SelectQueryBuilder<ProjectedEntity<S>>
    /**
     * Dynamic selection: accepts a value typed {@link SelectArg} (e.g. built at runtime). The
     * result cannot be narrowed in this case, so the entities are typed as the full entity.
     */
    (selection: SelectArg): SelectQueryBuilder<FullEntity>
  }

  /**
   * Returns a QueryBuilder instance for building and executing queries.
   * The QueryBuilder object follows the Builder pattern, allowing you to chain methods to build a query and then execute it.
   *
   * - Docs: https://docs.arkiv.network/ts-sdk/actions/public/query
   *
   * @deprecated Use {@link select} instead. `buildQuery()` returns only the entity `key` unless
   * you remember to opt in to data with `withAttributes()`/`withMetadata()`/`withPayload()`, which
   * is an easy mistake. `select()` makes the selection explicit. This method remains for backwards
   * compatibility and will be removed in a future release.
   *
   * @returns A QueryBuilder instance for building and executing queries. {@link QueryBuilder}
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const query = client.buildQuery()
   * const entities = await query.where("key", "=", "value").ownedBy("0x123").fetch()
   *
   */
  buildQuery: () => QueryBuilder

  /**
   * Returns a QueryResult instance for fetching the results of a raw query.
   * If no query options are provided, all payload is included, but no metadata (like owner, expiredAt, etc.) and attributes.
   * @param query - The raw query string
   * @param queryOptions - The optional query options - {@link QueryOptions}
   * @returns A QueryReturnType instance - {@link QueryReturnType}
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const queryResult = client.query('key = value && $owner = 0x123')
   * // queryResult = { entities: [{ key: "0x123", value: "0x123" }], cursor: undefined, blockNumber: undefined }
   * const queryResultWithOptions = client.query('key = value && $owner = 0x123', {
   *   includeData: {
   *     attributes: false,
   *     payload: true,
   *     metadata: true,
   *   },
   *   orderBy: [{ name: "key", type: "string", desc: "asc" }],
   *   resultsPerPage: 10,
   *   cursor: undefined,
   *   atBlock: undefined,
   * })
   * // queryResultWithOptions = { entities: [{ key: "0x123", value: "0x123" }], cursor: "...", blockNumber: 32223n }
   */
  query: (query: string, queryOptions?: QueryOptions) => Promise<QueryReturnType>

  /**
   * Returns the number of entities in the DBChain.
   * @returns The number of entities in the DBChain
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const entityCount = await client.getEntityCount()
   * // entityCount = 0
   */
  getEntityCount: () => Promise<number>

  /**
   * Returns the current block timing.
   * @returns The current block timing. {@link GetBlockTimingReturnType}
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const blockTiming = await client.getBlockTiming()
   * // {
   * //   currentBlock: 10n, // block number
   * //   currentBlockTime: 1234567890, // block timestamp
   * //   blockDuration: 2, // in seconds
   * // }
   */
  getBlockTiming: () => Promise<{
    currentBlock: bigint
    currentBlockTime: number
    blockDuration: number
  }>

  /**
   * Subscribes to entity events.
   * Takes an object with event handlers: {onError, onEntityCreated, onEntityUpdated, onEntityDeleted, onEntityExpiresInExtended}
   * @param pollingInterval - The polling interval in milliseconds
   * @param fromBlock - The block number to start from
   * @returns A function to unsubscribe from the events
   *
   * @example
   * import { createPublicClient, http } from 'arkiv'
   * import { braga } from 'arkiv/chains'
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const unsubscribe = await client.subscribeEntityEvents({
   *   onError: (error) => console.error("subscribeEntityEvents error", error),
   * })
   * unsubscribe() // unsubscribe from the events
   */
  subscribeEntityEvents: (
    {
      onError,
      onEntityCreated,
      onEntityUpdated,
      onEntityDeleted,
      onEntityExpiresInExtended,
    }: {
      onError?: (error: Error) => void
      onEntityCreated?: (event: OnEntityCreatedEvent) => void
      onEntityUpdated?: (event: OnEntityUpdatedEvent) => void
      onEntityDeleted?: (event: OnEntityDeletedEvent) => void
      onEntityExpired?: (event: OnEntityExpiredEvent) => void
      onEntityExpiresInExtended?: (event: OnEntityExpiresInExtendedEvent) => void
    },
    pollingInterval?: number,
    fromBlock?: bigint,
  ) => Promise<() => void>
}

export function publicArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
  return {
    getEntity: (key: Hex) => getEntity(client, key),
    query: (rawQuery: string, queryOptions?: QueryOptions) => query(client, rawQuery, queryOptions),
    buildQuery: () => new QueryBuilder(client),
    select: (selection?: SelectArg) => new SelectQueryBuilder(client, selection),
    getBlockTiming: () => getBlockTiming(client),
    getEntityCount: () => getEntityCount(client),
    subscribeEntityEvents: (
      {
        onError,
        onEntityCreated,
        onEntityUpdated,
        onEntityDeleted,
        onEntityExpired,
        onEntityExpiresInExtended,
      }: {
        onError?: (error: Error) => void
        onEntityCreated?: (event: OnEntityCreatedEvent) => void
        onEntityUpdated?: (event: OnEntityUpdatedEvent) => void
        onEntityDeleted?: (event: OnEntityDeletedEvent) => void
        onEntityExpired?: (event: OnEntityExpiredEvent) => void
        onEntityExpiresInExtended?: (event: OnEntityExpiresInExtendedEvent) => void
      },
      pollingInterval?: number,
      fromBlock?: bigint,
    ) =>
      subscribeEntityEvents(
        client,
        {
          onError,
          onEntityCreated,
          onEntityUpdated,
          onEntityDeleted,
          onEntityExpired,
          onEntityExpiresInExtended,
        },
        pollingInterval,
        fromBlock,
      ),
  }
}
