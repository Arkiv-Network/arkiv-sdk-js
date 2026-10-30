/**
 * One page of query results.
 *
 * A page is one request: to read further, run the query again with an `offset()` past this page.
 *
 * @typeParam TEntity - The shape of each row, inferred from the selection by `client.select()`.
 * @typeParam TCount - `bigint` when the query was built with `withCount()`, and `undefined` when it
 * was not.
 *
 * @example
 * const page = await client
 *   .select({ $key: true })
 *   .where(eq("category", "docs"))
 *   .orderBy(asc("$key"))
 *   .limit(20)
 *   .offset(40)
 *   .fetch()
 */
export class QueryResult<
  TEntity = Record<string, unknown>,
  TCount extends bigint | undefined = bigint | undefined,
> {
  /** The rows on this page — flat, as the selection lays them out. */
  readonly entities: readonly TEntity[]
  /**
   * The block this page was read at. Every request reads the latest block, so two pages of one
   * query can come from different blocks.
   */
  readonly blockNumber: bigint
  /**
   * How many matching entities this page left out because they did not fit the schema — always
   * `0` without a schema, or with `.from(schema, { onMismatch: "throw" })`.
   *
   * The node counts them toward the limit and the offset, so `entities.length + skipped` is how
   * many matches this page covered: add it to the offset to reach the next page. With an explicit
   * `limit()`, a page that covered fewer than the limit was the last. An empty page is not the
   * end on its own: every match on it may have been skipped.
   */
  readonly skipped: number
  /**
   * How many entities the query matches in all, regardless of the limit and offset — a `bigint`
   * when the query was built with `withCount()`, and `undefined` otherwise. It includes entities
   * left out for not fitting the schema, which {@link skipped} reports per page.
   */
  readonly count: TCount

  constructor(entities: readonly TEntity[], blockNumber: bigint, skipped: number, count: TCount) {
    this.entities = entities
    this.blockNumber = blockNumber
    this.skipped = skipped
    this.count = count
  }
}
