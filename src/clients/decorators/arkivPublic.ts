import type { Account, Chain, Client, Hex, PublicActions, Transport } from "viem"
import { getBlockTiming } from "../../actions/public/getBlockTiming"
import { getEntity } from "../../actions/public/getEntity"
import { getEntityCount } from "../../actions/public/getEntityCount"
import { type QueryOptions, type QueryReturnType, query } from "../../actions/public/query"
import { subscribeEntityEvents } from "../../actions/public/subscribeEntityEvents"
import type { Expression } from "../../query/expression"
import { SelectQueryBuilder } from "../../query/queryBuilder"
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
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { braga } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const entity = await client.getEntity(entityKey)
   * // Entity {
   * //   key: "0x9f2c…",
   * //   owner: "0xabc…",
   * //   contentType: "application/json",
   * //   payload: Uint8Array,          // entity.toJson() / entity.toText() decode it
   * //   attributes: { category: { type: "str", value: "docs" } },
   * //   expiresAt: 1_297_000n,
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
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { braga } from "@arkiv-network/sdk/chains"
   * import { eq } from "@arkiv-network/sdk/query"
   * import { http } from "viem"
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
   * // select specific fields — result typed { owner: Hex; attributes: Attributes }
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
     * Available fields: `key`, `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt`,
     * `creationFlags`, `contentType`, `payload`, `attributeSchema` and `attributes`.
     *
     * `attributes` also takes a map of names, to fetch only those:
     * `select({ key: true, attributes: { projectId: true } })`.
     *
     * Pass the selection inline so its fields stay literal `true`. A selection stored in a `let`/
     * `const` variable widens to `boolean` and the result type can no longer be narrowed — annotate
     * it `as const` (e.g. `const sel = { owner: true } as const`) in that case.
     *
     * @example
     * client.select({ owner: true, attributes: true }) // entities typed { owner, attributes }
     * client.select({ key: true, payload: true })      // includes payload → toText()/toJson() too
     * client.select({ key: true, attributeSchema: true }) // what shape is the data?
     */
    <const S extends EntitySelection>(selection: S): SelectQueryBuilder<ProjectedEntity<S>>
    /**
     * Dynamic selection: accepts a value typed {@link SelectArg} (e.g. built at runtime). The
     * result cannot be narrowed in this case, so the entities are typed as the full entity.
     */
    (selection: SelectArg): SelectQueryBuilder<FullEntity>
  }

  /**
   * Runs one query and returns one page, with no builder in between.
   *
   * Use {@link select} for anything typed — this returns full {@link Entity} objects whatever the
   * selection, and takes a raw string as an escape hatch for a query built elsewhere. A raw string
   * goes to the node exactly as written, with none of the name, type or operator checks the
   * expression combinators apply.
   *
   * @param query - An {@link Expression}, or the raw query string.
   * @param queryOptions - Selection, page size, cursor and block. {@link QueryOptions}
   * @returns One page of entities. {@link QueryReturnType}
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { braga } from "@arkiv-network/sdk/chains"
   * import { and, eq, gte } from "@arkiv-network/sdk/query"
   * import { i32 } from "@arkiv-network/sdk/attr"
   * import { http } from "viem"
   *
   * const client = createPublicClient({
   *   chain: braga,
   *   transport: http(),
   * })
   * const page = await client.query(and(eq("category", "docs"), gte("level", i32(10))), {
   *   select: { key: true, attributes: true },
   *   limit: 100,
   * })
   * // { entities: [Entity], cursor: "b64:…", blockNumber: 32223n }
   *
   * // The raw form, unchecked:
   * await client.query("category = str('docs') AND level >= i32(10)")
   */
  query: (query: Expression | string, queryOptions?: QueryOptions) => Promise<QueryReturnType>

  /**
   * Returns the total number of entities on the chain.
   * @returns The number of entities currently stored
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { braga } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
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
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { braga } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
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
   *
   * Takes an object of handlers, all optional: `onError`, `onEntityCreated`, `onEntityUpdated`,
   * `onEntityDeleted`, `onEntityExpired` and `onEntityExpiresInExtended`.
   *
   * @param pollingInterval - The polling interval in milliseconds
   * @param fromBlock - The block number to start from
   * @returns A function to unsubscribe from the events
   *
   * @example
   * import { createPublicClient } from "@arkiv-network/sdk"
   * import { braga } from "@arkiv-network/sdk/chains"
   * import { http } from "viem"
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
  ) => Promise<() => void>
}

export function publicArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
  return {
    getEntity: (key: Hex) => getEntity(client, key),
    query: (rawQuery: Expression | string, queryOptions?: QueryOptions) =>
      query(client, rawQuery, queryOptions),
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
