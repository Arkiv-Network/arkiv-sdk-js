import { NoMoreResultsError } from "../errors"

/** Fetches the page a cursor points at. */
type FetchPage<TEntity, TCount extends bigint | undefined> = (
  cursor: string,
) => Promise<QueryResult<TEntity, TCount>>

/**
 * One page of query results.
 *
 * A page is immutable: {@link next} returns the following page rather than mutating this one, so a
 * page that has been read stays readable.
 *
 * @typeParam TEntity - The shape of each row, inferred from the selection by `client.select()`.
 * @typeParam TCount - `bigint` when the query was built with `withCount()`, and `undefined` when it
 * was not.
 *
 * @example
 * let page = await client.select({ $key: true }).where(eq("category", "docs")).limit(100).fetch()
 * while (page.hasNextPage()) {
 *   page = await page.next()
 * }
 */
export class QueryResult<
  TEntity = Record<string, unknown>,
  TCount extends bigint | undefined = bigint | undefined,
> {
  /** The rows on this page — flat, as the selection lays them out. */
  readonly entities: readonly TEntity[]
  /**
   * The block this page was read at.
   *
   * Every page of one walk reads the same block — the cursor is bound to it — so results cannot
   * shift under a paginating reader.
   */
  readonly blockNumber: bigint
  /** The cursor for the next page, or `undefined` when this was the last one. */
  readonly cursor: string | undefined
  /**
   * How many matching entities this page left out because they did not fit the schema — always
   * `0` without a schema, or with `.from(schema, { onMismatch: "throw" })`.
   *
   * Counted per page, not per walk: `entities.length + skipped` is what the node returned for this
   * page, so a short or empty page with a cursor is explained here rather than mistaken for the
   * end of the results.
   */
  readonly skipped: number
  /**
   * How many entities the query matches in all, regardless of the page size — a `bigint` when the
   * query was built with `withCount()`, and `undefined` otherwise. Every page of one walk reads the
   * same block, so every page carries the same count. It includes entities left out for not fitting
   * the schema, which {@link skipped} reports per page.
   */
  readonly count: TCount

  private readonly fetchPage: FetchPage<TEntity, TCount>

  constructor(
    entities: readonly TEntity[],
    blockNumber: bigint,
    cursor: string | undefined,
    skipped: number,
    count: TCount,
    fetchPage: FetchPage<TEntity, TCount>,
  ) {
    this.entities = entities
    this.blockNumber = blockNumber
    this.cursor = cursor
    this.skipped = skipped
    this.count = count
    this.fetchPage = fetchPage
  }

  /**
   * Whether another page follows.
   *
   * The node omits the cursor once nothing remains, so this is an answer rather than the guess a
   * short final page would be — a full last page is reported correctly.
   */
  hasNextPage(): boolean {
    return this.cursor !== undefined
  }

  /**
   * Fetches the next page.
   *
   * @throws {NoMoreResultsError} If this was the last page — check {@link hasNextPage} first.
   * @throws {QueryError} If the node rejects the request; `kind === "cursor"` means the cursor
   * expired and the walk has to start again.
   */
  // Async so that "no more pages" arrives as a rejection like every other failure here, rather
  // than as a synchronous throw the caller's `.catch` would miss.
  async next(): Promise<QueryResult<TEntity, TCount>> {
    if (this.cursor === undefined) {
      throw new NoMoreResultsError()
    }
    return this.fetchPage(this.cursor)
  }
}
