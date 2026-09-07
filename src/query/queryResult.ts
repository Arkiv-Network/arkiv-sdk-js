import { NoMoreResultsError } from "../errors"
import type { Entity } from "../types/entity"

/** Fetches the page a cursor points at. */
type FetchPage<TEntity> = (cursor: string) => Promise<QueryResult<TEntity>>

/**
 * One page of query results.
 *
 * A page is immutable: {@link next} returns the following page rather than mutating this one, so a
 * page that has been read stays readable.
 *
 * @typeParam TEntity - The shape of each entity, inferred from the selection by `client.select()`.
 *
 * @example
 * let page = await client.select({ key: true }).where(eq("category", "docs")).limit(100).fetch()
 * while (page.hasNextPage()) {
 *   page = await page.next()
 * }
 */
export class QueryResult<TEntity = Entity> {
  /** The entities on this page. */
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

  private readonly fetchPage: FetchPage<TEntity>

  constructor(
    entities: readonly TEntity[],
    blockNumber: bigint,
    cursor: string | undefined,
    fetchPage: FetchPage<TEntity>,
  ) {
    this.entities = entities
    this.blockNumber = blockNumber
    this.cursor = cursor
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
  async next(): Promise<QueryResult<TEntity>> {
    if (this.cursor === undefined) {
      throw new NoMoreResultsError()
    }
    return this.fetchPage(this.cursor)
  }
}
