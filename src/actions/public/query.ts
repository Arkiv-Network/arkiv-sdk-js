import type { ArkivClient } from "../../clients/baseClient"
import { runQuery } from "../../query/engine"
import type { Expression } from "../../query/expression"
import {
  type FullEntity,
  projectSelection,
  type ResultOf,
  type SelectArg,
  type SelectionOf,
  toRow,
} from "../../query/selection"

export type QueryOptions<TSelection extends SelectArg = SelectArg> = {
  /** What to return — the same selection `select()` takes. Defaults to everything. */
  select?: TSelection | undefined
  /** Block height to read at. Defaults to the head. */
  atBlock?: bigint | undefined
  /** Page size, up to the node maximum of 100. */
  limit?: number | undefined
  /** Cursor from a previous page. */
  cursor?: string | undefined
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
  /** The cursor for the next page, or `undefined` when no pages remain. */
  cursor: string | undefined
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
 * operator checks the expression combinators apply.
 *
 * @throws If the selection asks for nothing, or names an attribute outside the name grammar.
 * @throws {QueryError} If the node rejects the query.
 */
export async function query<const S extends SelectArg = "*">(
  client: ArkivClient,
  query: Expression | string,
  options: QueryOptions<S> = {},
): Promise<QueryReturnType<QueryRow<S>>> {
  const projection = projectSelection(options.select)
  const page = await runQuery(client, {
    query: query.toString(),
    select: projection.select,
    limit: options.limit,
    cursor: options.cursor,
    atBlock: options.atBlock,
    count: options.count,
  })
  return {
    ...page,
    entities: page.entities.map((entity) => toRow(entity, projection) as QueryRow<S>),
  }
}
