import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import type { Entity } from "../types/entity"
import type { RpcEntity, RpcIncludeData } from "../types/rpcSchema"
import { entityFromRpcResult } from "../utils/entities"
import { processQuery } from "./engine"
import type { Predicate } from "./predicate"
import { QueryResult } from "./queryResult"
import { type SelectArg, selectionToIncludeData } from "./selection"

/**
 * Data-selection parameters forwarded to the query engine on each fetch.
 * Subclasses of {@link BaseQueryBuilder} decide which parts of an entity are fetched.
 */
type SelectionParams = {
  withAttributes?: boolean | undefined
  withMetadata?: boolean | undefined
  withPayload?: boolean | undefined
  includeData?: RpcIncludeData | undefined
}

/**
 * BaseQueryBuilder holds the query-building logic shared by every query builder
 * (filtering, pagination, execution). It follows the Builder pattern,
 * allowing methods to be chained. Subclasses decide how data selection is expressed
 * by implementing the protected `selectionParams` method.
 *
 * Use {@link SelectQueryBuilder} via `client.select()` to build and execute queries.
 *
 * @typeParam TEntity - The shape of each entity produced by {@link BaseQueryBuilder.fetch}.
 */
export abstract class BaseQueryBuilder<TEntity> {
  protected _client: ArkivClient
  protected _ownedBy: Hex | undefined
  protected _createdBy: Hex | undefined
  protected _validAtBlock: bigint | undefined
  protected _limit: number | undefined
  protected _cursor: string | undefined
  protected _predicates: Predicate[]

  constructor(client: ArkivClient) {
    this._client = client
    this._predicates = []
  }

  /**
   * Sets the ownedBy filter
   * @param ownedBy - The address of the owner
   * @returns The query builder instance
   *
   * @example
   * const builder = client.select()
   * builder.ownedBy("0x1234567890123456789012345678901234567890")
   */
  ownedBy(ownedBy: Hex): this {
    this._ownedBy = ownedBy
    return this
  }

  /**
   * Sets the createdBy filter
   * @param createdBy - The address of the creator
   * @returns The query builder instance
   *
   * @example
   * const builder = client.select()
   * builder.createdBy("0x1234567890123456789012345678901234567890")
   */
  createdBy(createdBy: Hex): this {
    this._createdBy = createdBy
    return this
  }

  /**
   * Sets the limit for the query
   * @param limit - The number of entities to return
   * @returns The query builder instance
   *
   * @example
   * const builder = client.select()
   * builder.limit(10)
   */
  limit(limit: number): this {
    this._limit = limit
    return this
  }

  /**
   * Sets the cursor for the query - it is advances setting which rather shouldn't be used manually but it is provided from query result if limit is used (pagination).
   * @param cursor - The cursor to set which tells to RPC Query server where to start or continue the query.
   * @returns The query builder instance
   *
   * @example
   * const builder = client.select()
   * builder.cursor("0xABC123")
   */
  cursor(cursor: string): this {
    this._cursor = cursor
    return this
  }

  /**
   * Sets the validAtBlock for the query which tells at which block height the state we are intested.
   * If not set, the latest block is  used.
   * @param validAtBlock - The block number to set
   * @returns The query builder instance
   *
   * @example
   * const builder = client.select()
   * builder.validAtBlock(10000)
   */
  validAtBlock(validAtBlock: bigint): this {
    this._validAtBlock = validAtBlock
    return this
  }

  /**
   * Sets the predicates for the query limiting the results. It can be a single predicate or an array of predicates combined with 'and'.
   * Predicates can be nested using 'or' and 'and' predicates.
   * @param predicates - The predicates to set
   * @returns The query builder instance
   *
   * @example
   * const builder = client.select()
   * builder.where(eq("name", "John"))
   * builder.where([eq("name", "John"), eq("age", 30)])
   * builder.where([eq("name", "John"), or([eq("age", 30), eq("age", 31)])])
   * builder.where([eq("name", "John"), and([eq("age", 30), eq("age", 31)])])
   * builder.where([eq("name", "John"), or([eq("age", 30), and([eq("age", 31), eq("age", 32)])])])
   * builder.where([eq("name", "John"), and([eq("age", 30), or([eq("age", 31), eq("age", 32)])])])
   * builder.where([eq("name", "John"), and([eq("age", 30), or([eq("age", 31), and([eq("age", 32), eq("age", 33)])])])])
   */
  where(predicates: Predicate[] | Predicate): this {
    if (Array.isArray(predicates)) {
      this._predicates.push(...predicates)
    } else {
      this._predicates.push(predicates)
    }
    return this
  }

  /**
   * Returns the data-selection parameters forwarded to the query engine.
   * Subclasses decide which parts of an entity are fetched.
   */
  protected abstract selectionParams(): SelectionParams

  /**
   * Builds a single result entity from a raw RPC entity. Subclasses decide the produced shape
   * (a full {@link Entity}, or a projected object inferred from the selection).
   */
  protected abstract projectEntity(rpcEntity: RpcEntity): TEntity | Promise<TEntity>

  /**
   * Fetches the entities from the query.
   * It will return a QueryResult instance which can be used to fetch the next and previous pages.
   * @returns The QueryResult instance {@link QueryResult}
   *
   * @example
   * const builder = client.select()
   * const result = await builder.where(eq("name", "John")).fetch()
   * // result = { entities: [Entity, Entity, Entity], next: async () => QueryResult, previous: async () => QueryResult }
   */
  async fetch(): Promise<QueryResult<TEntity>> {
    const queryResult = await processQuery(this._client, {
      predicates: this._predicates,
      limit: this._limit,
      cursor: this._cursor,
      ownedBy: this._ownedBy,
      createdBy: this._createdBy,
      validAtBlock: this._validAtBlock,
      ...this.selectionParams(),
    })

    const entities = await Promise.all(queryResult.data.map((entity) => this.projectEntity(entity)))

    this.cursor(queryResult.cursor)
    this.validAtBlock(BigInt(queryResult.blockNumber ?? 0))

    return new QueryResult<TEntity>(entities, this, this._cursor, this._limit, this._validAtBlock)
  }

  /**
   * Counts the entities from the query.
   * @returns The number of entities
   *
   * @example
   * const builder = client.select()
   * const result = await builder.where(eq("name", "John")).count()
   * // result = 10
   */
  async count() {
    const queryResult = await processQuery(this._client, {
      predicates: this._predicates,
      limit: this._limit,
      cursor: this._cursor,
      ownedBy: this._ownedBy,
      createdBy: this._createdBy,
      validAtBlock: this._validAtBlock,
      withAttributes: false,
      withMetadata: false,
      withPayload: false,
    })

    return queryResult.data.length ?? 0
  }
}

/**
 * QueryBuilder is a helper class to build queries to the Arkiv DBChains.
 * It can be used to fetch entities from the Arkiv DBChains. It follows the Builder pattern allowing chaining of methods.
 *
 * By default the result includes only the entity `key`. Additional data is opt-in through
 * `withAttributes()`, `withMetadata()` and `withPayload()`.
 *
 * @deprecated Use {@link SelectQueryBuilder} via `client.select()` instead. Declaring the
 * selection up front avoids the common mistake of forgetting to opt in to data and getting back
 * entities with only their `key` populated. This class remains for backwards compatibility and
 * will be removed in a future release.
 *
 * @param client - The Arkiv client
 * @returns The QueryBuilder instance {@link QueryBuilder}
 */
export class QueryBuilder extends BaseQueryBuilder<Entity> {
  private _withAttributes: boolean | undefined
  private _withMetadata: boolean | undefined
  private _withPayload: boolean | undefined

  /**
   * Sets the withAttributes flag which will return the attributes for the entities if true
   * @param withAttributes - The boolean value to set
   * @returns The QueryBuilder instance
   *
   * @example
   * const builder = client.buildQuery()
   * builder.withAttributes(true)
   */
  withAttributes(withAttributes: boolean = true): this {
    this._withAttributes = withAttributes
    return this
  }

  /**
   * Sets the withMetadata flag which will return the metadata (like owner, expiredAt, etc.) for the entities if true
   * @param withMetadata - The boolean value to set
   * @returns The QueryBuilder instance
   *
   * @example
   * const builder = client.buildQuery()
   * builder.withMetadata(true)
   */
  withMetadata(withMetadata: boolean = true): this {
    this._withMetadata = withMetadata
    return this
  }

  /**
   * Sets the withPayload flag which will return the payload for the entities if true
   * @param withPayload - The boolean value to set
   * @returns The QueryBuilder instance
   *
   * @example
   * const builder = client.buildQuery()
   * builder.withPayload(true)
   */
  withPayload(withPayload: boolean = true): this {
    this._withPayload = withPayload
    return this
  }

  protected selectionParams(): SelectionParams {
    return {
      withAttributes: this._withAttributes,
      withMetadata: this._withMetadata,
      withPayload: this._withPayload,
    }
  }

  protected projectEntity(rpcEntity: RpcEntity): Promise<Entity> {
    return entityFromRpcResult(rpcEntity)
  }
}

/**
 * SelectQueryBuilder is the recommended query builder. It requires the selection to be declared
 * up front, so results always contain exactly the data you asked for — and the type of each
 * returned entity is narrowed to exactly the selected fields.
 *
 * The selection is fixed at construction time and is flat — each field maps to an entity field.
 * Create one via `client.select(...)` rather than constructing it directly, so the result type is
 * inferred from the selection.
 *
 * @typeParam TEntity - The projected entity shape, inferred from the selection by `client.select()`.
 *
 * @example
 * // everything
 * await client.select().where(eq("name", "John")).fetch()
 * await client.select("*").where(eq("name", "John")).fetch()
 * // specific fields
 * await client.select({ owner: true, attributes: true }).fetch()
 * // a single field — result is typed (flat) { owner: Hex }
 * await client.select({ owner: true }).fetch()
 */
export class SelectQueryBuilder<TEntity> extends BaseQueryBuilder<TEntity> {
  private _includeData: RpcIncludeData

  constructor(client: ArkivClient, selection?: SelectArg) {
    super(client)
    this._includeData = selectionToIncludeData(selection)
  }

  protected selectionParams(): SelectionParams {
    return { includeData: this._includeData }
  }

  protected async projectEntity(rpcEntity: RpcEntity): Promise<TEntity> {
    // The runtime value is a full Entity (with methods); the static type is narrowed to the
    // selected fields via `client.select()`'s inference.
    return (await entityFromRpcResult(rpcEntity)) as unknown as TEntity
  }
}
