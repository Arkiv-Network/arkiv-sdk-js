import { NoCursorOrLimitError, NoMoreResultsError } from "../errors"
import type { Entity } from "../types/entity"
import { getLogger } from "../utils/logger"
import type { BaseQueryBuilder } from "./queryBuilder"

const logger = getLogger("query:result")

/**
 * The result of a query. Holds the fetched entities and supports cursor-based pagination.
 *
 * @typeParam TEntity - The shape of each entity, inferred from the query builder
 *   (a full {@link Entity}, or a projected object inferred from a `select()` selection).
 */
export class QueryResult<TEntity = Entity> {
  entities: TEntity[]
  private _endOfIteration: boolean
  private _cursor: string | undefined
  private _limit: number | undefined
  private _validAtBlock: bigint | undefined
  private _queryBuilder: BaseQueryBuilder<TEntity>

  // Public getters for internal state
  get queryBuilder(): BaseQueryBuilder<TEntity> {
    return this._queryBuilder
  }

  get cursor(): string | undefined {
    return this._cursor
  }

  constructor(
    entities: TEntity[],
    queryBuilder: BaseQueryBuilder<TEntity>,
    cursor: string | undefined,
    limit: number | undefined,
    validAtBlock: bigint | undefined,
  ) {
    this.entities = entities
    this._queryBuilder = queryBuilder
    this._endOfIteration = !limit || entities.length < limit
    this._cursor = cursor
    this._limit = limit
    this._validAtBlock = validAtBlock
  }

  async next() {
    if (this._cursor === undefined || this._limit === undefined) {
      throw new NoCursorOrLimitError()
    }
    if (this._endOfIteration) {
      throw new NoMoreResultsError()
    }
    this._queryBuilder.cursor(this._cursor)
    const result = await this._queryBuilder.fetch()
    this.entities = result.entities
    // Update the query builder reference
    this._queryBuilder = result.queryBuilder
    // Check if we've reached the end (no more cursor or we got fewer entities than limit)
    this._endOfIteration = !result.cursor || result.entities.length < this._limit
    // Update the cursor
    this._cursor = result.cursor

    // TODO check current block height and if it is not too old
    logger("Current block height for next page %s", this._validAtBlock?.toString() ?? "unknown")
  }

  hasNextPage() {
    return !this._endOfIteration
  }
}
