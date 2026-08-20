import type { Hex } from "viem"
import { addr } from "../attr"
import type { ArkivClient } from "../clients/baseClient"
import type { Entity } from "../types/entity"
import type { RpcSelect } from "../types/rpcSchema"
import { type QueryRequest, runQuery } from "./engine"
import { InvalidPredicateError } from "./errors"
import { and, type Expression, eq, type or } from "./expression"
import { QueryResult } from "./queryResult"
import { type SelectArg, toRpcSelect } from "./selection"

/**
 * Builds and runs a query.
 *
 * The selection is fixed when the builder is created and the filter is added by chaining, so the
 * result type is known before a single predicate is written. Create one with `client.select(...)`
 * rather than constructing it directly — that is what infers the entity shape from the selection.
 *
 * Every filter added with {@link where}, {@link ownedBy} and {@link createdBy} must hold; use
 * {@link or} for alternatives inside one call.
 *
 * @typeParam TEntity - The projected entity shape, inferred from the selection by `client.select()`.
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { i32 } from "@arkiv-network/sdk/attr"
 * import { cheesecake } from "@arkiv-network/sdk/chains"
 * import { eq, gte, or } from "@arkiv-network/sdk/query"
 * import { http } from "viem"
 *
 * const client = createPublicClient({ chain: cheesecake, transport: http() })
 *
 * const page = await client
 *   .select({ key: true, attributes: true })
 *   .where(gte("level", i32(10)), or(eq("status", "open"), eq("status", "review")))
 *   .ownedBy(owner)
 *   .limit(100)
 *   .fetch()
 *
 * for (const entity of page.entities) console.log(entity.key, entity.attributes)
 */
export class SelectQueryBuilder<TEntity = Entity> {
  private readonly _client: ArkivClient
  private readonly _select: RpcSelect
  private readonly _filters: Expression[] = []
  private _ownedBy: Expression | undefined
  private _createdBy: Expression | undefined
  private _limit: number | undefined
  private _cursor: string | undefined
  private _atBlock: bigint | undefined

  constructor(client: ArkivClient, selection?: SelectArg) {
    this._client = client
    this._select = toRpcSelect(selection)
  }

  /**
   * Adds filters. Everything passed here, and across repeated calls, must hold.
   *
   * @param expressions - The expressions, as separate arguments or one array.
   *
   * @example
   * builder.where(eq("category", "docs"))
   * builder.where(gte("level", i32(10)), lt("level", i32(20)))
   * builder.where(or(eq("status", "open"), not(exists("closedAt"))))
   */
  where(expressions: readonly Expression[]): this
  where(...expressions: Expression[]): this
  where(...expressions: (Expression | readonly Expression[])[]): this {
    this._filters.push(...expressions.flat())
    return this
  }

  /**
   * Restricts the results to entities this account owns — shorthand for
   * `where(eq("$owner", addr(owner)))`. Calling it again replaces the filter.
   *
   * @example
   * builder.ownedBy("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
   */
  ownedBy(owner: Hex): this {
    this._ownedBy = eq("$owner", addr(owner))
    return this
  }

  /**
   * Restricts the results to entities this account created — shorthand for
   * `where(eq("$creator", addr(creator)))`. Calling it again replaces the filter.
   *
   * The creator never changes; the owner does, so these differ after a transfer.
   */
  createdBy(creator: Hex): this {
    this._createdBy = eq("$creator", addr(creator))
    return this
  }

  /**
   * Sets the page size, up to the node maximum of 200. Without it the node picks the page size.
   *
   * @example
   * builder.limit(100)
   */
  limit(limit: number): this {
    this._limit = limit
    return this
  }

  /**
   * Starts from a cursor returned by an earlier page.
   *
   * Pagination normally goes through {@link QueryResult.next}, which carries the cursor for you;
   * this is for resuming a walk in a later process. A cursor is bound to the query, block and
   * selection it came from, so it must be used with an identically-built query — {@link atBlock}
   * set to the `blockNumber` of the page the cursor came from is required (persist the two
   * together), and a fetch with a cursor but no block rejects locally.
   */
  cursor(cursor: string): this {
    this._cursor = cursor
    return this
  }

  /**
   * Reads the state as of a given block rather than the head. The block must be within the range
   * the node retains.
   *
   * @example
   * builder.atBlock(1_297_000n)
   */
  atBlock(block: bigint): this {
    this._atBlock = block
    return this
  }

  /**
   * The query string this builder will send — the same text the node parses.
   *
   * @throws {InvalidPredicateError} If no filter has been added.
   */
  toString(): string {
    const filters = [...this._filters]
    if (this._ownedBy) filters.push(this._ownedBy)
    if (this._createdBy) filters.push(this._createdBy)
    if (filters.length === 0) {
      throw new InvalidPredicateError(
        "A query needs at least one filter — the language has no spelling for 'match every " +
          'entity". Add a where(...) predicate, or narrow by ownedBy(...) / createdBy(...).',
      )
    }
    return and(filters).toString()
  }

  /**
   * Runs the query and returns the first page.
   *
   * @throws {InvalidPredicateError} If no filter has been added.
   * @throws {QueryError} If the node rejects the query.
   *
   * @example
   * const page = await client.select({ key: true }).where(eq("category", "docs")).fetch()
   * page.entities        // this page
   * await page.next()    // the next one
   */
  // Async so that a builder with no filter rejects like every other failure here, rather than
  // throwing synchronously out of a call the caller is awaiting.
  async fetch(): Promise<QueryResult<TEntity>> {
    // Snapshot the request here, so the pages of one walk are all pages of the *same* query. The
    // builder stays mutable and reusable; a cursor is bound to the query, block and selection it
    // was issued for, so re-reading a since-edited builder would page with a mismatched cursor.
    const request = Object.freeze({
      query: this.toString(),
      select: this._select,
      limit: this._limit,
      atBlock: this._atBlock,
    })
    return fetchPage<TEntity>(this._client, request, this._cursor)
  }

  /**
   * Walks every page, yielding one entity at a time.
   *
   * @example
   * for await (const entity of client.select({ key: true }).where(eq("category", "docs"))) {
   *   console.log(entity.key)
   * }
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<TEntity> {
    let page: QueryResult<TEntity> | undefined = await this.fetch()
    while (page) {
      yield* page.entities
      page = page.hasNextPage() ? await page.next() : undefined
    }
  }
}

/**
 * Fetches one page and wires up the next.
 *
 * Free-standing rather than a method: a page holds this closure for its lifetime, and closing over
 * a frozen request keeps the builder — and everything it references — out of that reference.
 */
async function fetchPage<TEntity>(
  client: ArkivClient,
  request: Readonly<Omit<QueryRequest, "cursor">>,
  cursor: string | undefined,
): Promise<QueryResult<TEntity>> {
  const response = await runQuery(client, { ...request, cursor })

  // Pin the rest of the walk to the block this page was read at. Without a block the node reads
  // at the head, and a block mined between two pages would leave the cursor bound to the previous
  // one — a `kind: "cursor"` rejection mid-walk on an otherwise valid page-through.
  const pinned = Object.freeze({ ...request, atBlock: response.blockNumber })

  return new QueryResult<TEntity>(
    // Every row decodes to a full Entity; the static narrowing to the selected fields comes from
    // `client.select()`'s inference and nothing at runtime depends on it.
    response.entities as unknown as TEntity[],
    response.blockNumber,
    response.cursor,
    (next) => fetchPage<TEntity>(client, pinned, next),
  )
}
