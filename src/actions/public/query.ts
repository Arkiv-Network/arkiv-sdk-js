import type { ArkivClient } from "../../clients/baseClient"
import { runQuery } from "../../query/engine"
import type { Expression } from "../../query/expression"
import { type SelectArg, toRpcSelect } from "../../query/selection"
import type { Entity } from "../../types/entity"

export type QueryOptions = {
  /** What to return. Defaults to everything. */
  select?: SelectArg | undefined
  /** Block height to read at. Defaults to the head. */
  atBlock?: bigint | undefined
  /** Page size, up to the node maximum of 200. */
  limit?: number | undefined
  /**
   * Cursor from a previous page. Pass that page's `blockNumber` as {@link atBlock} alongside it —
   * the cursor is bound to the block it was issued at, and a block mined in between would
   * otherwise move the head on and invalidate it.
   */
  cursor?: string | undefined
}

export type QueryReturnType = {
  entities: Entity[]
  /** The cursor for the next page, or `undefined` when no pages remain. */
  cursor: string | undefined
  /** The block the page was read at. */
  blockNumber: bigint
}

/**
 * Runs a single query and returns one page, with no builder in between.
 *
 * Takes either an {@link Expression} or a raw query string. The string form is an escape hatch for
 * a query built elsewhere — it goes to the node exactly as written, with none of the name, type or
 * operator checks the expression combinators apply.
 *
 * @throws {QueryError} If the node rejects the query.
 */
export function query(
  client: ArkivClient,
  query: Expression | string,
  options: QueryOptions = {},
): Promise<QueryReturnType> {
  return runQuery(client, {
    query: query.toString(),
    select: toRpcSelect(options.select),
    limit: options.limit,
    cursor: options.cursor,
    atBlock: options.atBlock,
  })
}
