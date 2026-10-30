import type { ArkivClient } from "../../clients/baseClient"
import { runQuery } from "../../query/engine"
import type { Expression } from "../../query/expression"
import { checkedOrderTerm, type OrderCheck, type OrderTerm, renderOrderBy } from "../../query/order"
import {
  type FullEntity,
  projectSelection,
  type ResultOf,
  type SelectArg,
  type SelectionOf,
  toRow,
} from "../../query/selection"

export type QueryOptions<
  TSelection extends SelectArg = SelectArg,
  TOrder extends OrderTerm = OrderTerm,
> = {
  /** What to return — the same selection `select()` takes. Defaults to everything. */
  select?: TSelection | undefined
  /**
   * The sort, an `asc(...)` or a `desc(...)`, sent as an `ORDER BY` clause after the query. There
   * is no schema here, so a key on a user attribute names its type, as in `desc("score", "dec")`.
   */
  orderBy?: (TOrder & OrderCheck<TOrder, undefined>) | undefined
  /** Page size, up to the node maximum of 100. */
  limit?: number | undefined
  /**
   * How many matches to skip before the page. Defaults to none. Each request reads the latest
   * block, so writes between two requests shift the matches, and a row can repeat or be missed.
   * Sort by a key that does not change, such as `asc("$key")`, so that pages line up at least while
   * nothing is written.
   */
  offset?: number | undefined
  /** Whether to also count every entity the query matches, returned as `count`. */
  count?: boolean | undefined
}

/**
 * What one result of a `query()` reads as for selection `S`: the same row `select(S)` returns
 * without a schema — every field when everything is selected, and every field optional when the
 * selection is only known at runtime.
 */
export type QueryRow<S> = ResultOf<SelectionOf<S>, undefined>

export type QueryReturnType<TResult = FullEntity> = {
  entities: TResult[]
  /** The block the page was read at. */
  blockNumber: bigint
  /** How many entities the query matches, if `count` was set. */
  count: bigint | undefined
}

/**
 * Runs a single query and returns one page, with no builder in between.
 *
 * The selection means what it does in `select()`, and each result is the same flat row a query
 * without a schema returns — typed from the selection, with every attribute an `ArkivValue` or
 * `undefined`.
 *
 * Takes either an {@link Expression} or a raw query string. The string form is an escape hatch for
 * a query built elsewhere — it goes to the node exactly as written, with none of the name, type or
 * operator checks the expression combinators apply. An `orderBy` is checked either way, and goes
 * after the string as its `ORDER BY` clause, so a raw string must not end in one of its own.
 *
 * @throws If the selection asks for nothing, or names an attribute outside the name grammar.
 * @throws If `limit` is not an integer from 1 to 100, or `offset` is not a non-negative integer.
 * @throws {InvalidPredicateError} If `orderBy` is not a key `asc` or `desc` would build, or names a
 * user attribute without its type.
 * @throws {QueryError} If the node rejects the query.
 */
export async function query<const S extends SelectArg = "*", const K extends OrderTerm = OrderTerm>(
  client: ArkivClient,
  query: Expression | string,
  options: QueryOptions<S, K> = {},
): Promise<QueryReturnType<QueryRow<S>>> {
  const projection = projectSelection(options.select)
  const filters = query.toString()
  const order =
    options.orderBy === undefined
      ? undefined
      : renderOrderBy(checkedOrderTerm(options.orderBy), undefined)
  const page = await runQuery(client, {
    query: order === undefined ? filters : `${filters} ${order}`,
    select: projection.select,
    limit: options.limit,
    offset: options.offset,
    count: options.count,
  })
  return {
    ...page,
    entities: page.entities.map((entity) => toRow(entity, projection) as QueryRow<S>),
  }
}
