import type { ArkivClient } from "../clients/baseClient"
import { isSchema, type Schema, SchemaDefinitionError, SchemaMismatchError } from "../schema"
import type { Entity } from "../types/entity"
import { QueryBuilderBase } from "./builderBase"
import { type QueryRequest, runQuery } from "./engine"
import type { or } from "./expression"
import { QueryResult } from "./queryResult"
import {
  type Projection,
  projectSelection,
  type ResultOf,
  type SelectArg,
  snapshotSelection,
  toRow,
  type UnknownSelection,
} from "./selection"

/**
 * `from(schema)`'s check that every selected key is an entity field or a column — `unknown` when
 * it holds, and an object naming the offenders, which no schema satisfies, when it does not.
 */
type SelectionCheck<TSelection, TSchema extends Schema> = [
  UnknownSelection<TSelection, TSchema>,
] extends [never]
  ? unknown
  : { "selected names that are not columns of this schema": UnknownSelection<TSelection, TSchema> }

/**
 * How a query through a schema treats a matching entity that does not fit the schema — one not
 * tagged with a named schema's name, or missing a selected required column or holding one of
 * another type. Columns the selection leaves out are not checked.
 */
export type FromOptions = {
  /**
   * `"throw"` (the default) fails the fetch with a {@link SchemaMismatchError}. `"skip"` leaves the
   * entity out of the page instead — so a page can hold fewer rows than its limit, and a page whose
   * every entity was skipped is empty while later pages still have rows. Each page reports how many
   * it left out as {@link QueryResult.skipped}.
   */
  onMismatch?: "throw" | "skip" | undefined
}

/**
 * Builds and runs a query.
 *
 * The selection is fixed when the builder is created and the filter is added by chaining, so the
 * result type is known before a single predicate is written. Create one with `client.select(...)`
 * rather than constructing it directly — that is what infers the result shape from the selection.
 *
 * The query returns flat rows: the selected entity fields and attributes side by side. Naming a
 * schema with {@link from} changes what the selection means for nothing but the selected
 * attributes — they come back typed and checked as the schema declares — and has `where` checked
 * against it, so that filtering on a column the schema does not index, or comparing one against the
 * wrong type, is a compile error. A named schema also restricts the query to entities tagged with
 * its name, and leaves that tag out of the rows' `$attributes` and `$attributeSchema`.
 *
 * Every filter added with {@link where}, {@link ownedBy} and {@link createdBy} must hold; use
 * {@link or} for alternatives inside one call.
 *
 * @typeParam TSelection - The selection, inferred by `client.select()`.
 * @typeParam TSchema - The schema named with {@link from}, if any.
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { dec } from "@arkiv-network/sdk/schema"
 * import { tiramisu } from "@arkiv-network/sdk/chains"
 * import { and, eq, gt } from "@arkiv-network/sdk/query"
 * import { http } from "viem"
 *
 * const client = createPublicClient({ chain: tiramisu, transport: http() })
 *
 * const page = await client
 *   .select({ $key: true, author: true, title: true })
 *   .from(Posts)
 *   .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
 *   .limit(20)
 *   .fetch()
 *
 * for (const row of page.entities) console.log(row.$key, row.title.value)
 */
export class SelectQueryBuilder<
  TSelection = "*",
  TSchema extends Schema | undefined = undefined,
  TCount extends bigint | undefined = undefined,
> extends QueryBuilderBase<TSchema> {
  private readonly _selection: SelectArg | undefined
  private _projection: Projection
  private _onMismatch: "throw" | "skip" = "throw"
  private _limit: number | undefined
  private _cursor: string | undefined
  private _withCount = false

  /**
   * @throws If the selection is not `"*"` or an object, asks for nothing, or names an attribute
   * outside the name grammar.
   */
  constructor(client: ArkivClient, selection?: SelectArg) {
    super(client)
    // A copy: the caller's object may change after this, and the builder is typed for it as it was.
    this._selection = snapshotSelection(selection)
    this._projection = projectSelection(this._selection)
  }

  /**
   * Runs the query through a schema. The selection keeps its meaning and the rows their shape;
   * each selected attribute becomes a column — typed as the schema declares, and checked against
   * it — and `where` is checked against the schema's indexed columns.
   *
   * A named schema also filters: only entities tagged with its name match, so a query through it
   * sees only entities written through it, and needs no other filter. The tag is how the query finds
   * them rather than one of their attributes, so rows leave it out of `$attributes` and
   * `$attributeSchema`. An unnamed schema types the query without filtering it — `where` alone
   * decides which entities match.
   *
   * A matching entity that does not fit — a selected required column missing or of another type,
   * or, for a named schema, a tag that does not match — fails the fetch with a
   * {@link SchemaMismatchError}, or is left out of the page with `{ onMismatch: "skip" }`. Columns
   * the selection leaves out are not checked.
   *
   * Returns a new builder, carrying whatever this one already holds; this one is left as it was.
   *
   * @param schema - The schema, built with `defineSchema`.
   * @param options - How to treat entities that do not fit. {@link FromOptions}
   * @throws {SchemaDefinitionError} If `schema` was not built with `defineSchema`.
   * @throws If the selection names something that is neither an entity field nor a column.
   *
   * @example
   * client.select({ $key: true, title: true }).from(Posts)   // rows typed { $key; title }
   * client.select().from(Posts)                               // every field and every column
   * client.select().from(Posts, { onMismatch: "skip" })       // leave out entities that do not fit
   */
  from<S extends Schema>(
    schema: S & SelectionCheck<TSelection, S>,
    options: FromOptions = {},
  ): SelectQueryBuilder<TSelection, S, TCount> {
    if (!isSchema(schema)) {
      throw new SchemaDefinitionError("from() takes a schema built with defineSchema(...)")
    }
    const { onMismatch = "throw" } = options
    if (onMismatch !== "throw" && onMismatch !== "skip") {
      throw new TypeError(`onMismatch must be "throw" or "skip", got ${String(onMismatch)}`)
    }
    // Resolved here rather than at fetch time, so a selection naming something that is neither an
    // entity field nor a column fails at the call that made it wrong.
    const projection = projectSelection(this._selection, schema)
    const typed = this.copy<SelectQueryBuilder<TSelection, S, TCount>>()
    typed._schema = schema
    typed._projection = projection
    typed._onMismatch = onMismatch
    return typed
  }

  /**
   * Sets the page size, up to the node maximum of 100. Without it the node picks the page size.
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
   * selection it came from, so it must be used with an identically-built query.
   */
  cursor(cursor: string): this {
    this._cursor = cursor
    return this
  }

  /**
   * Also counts every entity the query matches, regardless of the page size. Each page then carries
   * the total as {@link QueryResult.count}, typed `bigint`, so a paginated list can show it without
   * a second query. To count without fetching rows, use `client.count()` instead.
   *
   * The node counts what the filters match. Through a schema, that includes entities the pages
   * leave out for not fitting it, so the rows of a whole walk can add up to less than the count:
   * the difference is the sum of every page's {@link QueryResult.skipped}.
   *
   * @throws If, when fetched, the node returns no count — it predates the count projection.
   *
   * Returns a new builder, carrying whatever this one already holds; this one is left as it was.
   *
   * @example
   * const page = await builder.withCount().limit(20).fetch()
   * page.count // every match, not just these 20
   */
  withCount(): SelectQueryBuilder<TSelection, TSchema, bigint> {
    const counted = this.copy<SelectQueryBuilder<TSelection, TSchema, bigint>>()
    counted._withCount = true
    return counted
  }

  /**
   * Runs the query and returns the first page.
   *
   * @throws {InvalidPredicateError} If no filter has been added, or a filter does not fit the
   * schema.
   * @throws If the {@link limit} is not an integer from 1 to 100.
   * @throws {SchemaMismatchError} If, through a schema, a matching entity does not fit the selected
   * columns or a named schema's tag — unless `from()` was given `{ onMismatch: "skip" }`.
   * @throws {QueryError} If the node rejects the query.
   *
   * @example
   * const page = await client.select({ $key: true }).where(eq("category", "docs")).fetch()
   * page.entities        // this page
   * await page.next()    // the next one
   */
  fetch(): Promise<QueryResult<ResultOf<TSelection, TSchema>, TCount>> {
    return this.fetchFirstPage()
  }

  // Async so that a builder with no filter rejects like every other failure here, rather than
  // throwing synchronously out of a call the caller is awaiting.
  private async fetchFirstPage(): Promise<QueryResult<ResultOf<TSelection, TSchema>, TCount>> {
    // Snapshot the request here, so the pages of one walk are all pages of the *same* query. The
    // builder stays mutable and reusable; a cursor is bound to the query, block and selection it
    // was issued for, so re-reading a since-edited builder would page with a mismatched cursor.
    const projection = this._projection
    const request = Object.freeze({
      query: this.toString(),
      select: projection.select,
      limit: this._limit,
      atBlock: this._atBlock,
      count: this._withCount,
    })
    // Every entity is laid out as a row of the selection — and, through a schema, checked against it.
    // The static narrowing to the selected fields comes from `client.select()`'s inference and
    // nothing at runtime depends on it.
    const skip = this._onMismatch === "skip"
    const decode = ((entity: Entity) => {
      try {
        return toRow(entity, projection)
      } catch (error) {
        if (skip && error instanceof SchemaMismatchError) return SKIPPED
        throw error
      }
    }) as (entity: Entity) => ResultOf<TSelection, TSchema> | typeof SKIPPED
    return fetchPage(this._client, request, this._cursor, decode) as Promise<
      QueryResult<ResultOf<TSelection, TSchema>, TCount>
    >
  }

  /**
   * Walks every page, yielding one row at a time.
   *
   * @example
   * for await (const row of client.select({ $key: true }).where(eq("category", "docs"))) {
   *   console.log(row.$key)
   * }
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<ResultOf<TSelection, TSchema>> {
    let page: QueryResult<ResultOf<TSelection, TSchema>, TCount> | undefined =
      await this.fetchFirstPage()
    while (page) {
      yield* page.entities
      page = page.hasNextPage() ? await page.next() : undefined
    }
  }
}

/** What `decode` returns for an entity `{ onMismatch: "skip" }` leaves out of its page. */
const SKIPPED: unique symbol = Symbol("skipped")

/**
 * Fetches one page and wires up the next.
 *
 * Free-standing rather than a method: a page holds this closure for its lifetime, and closing over
 * a frozen request keeps the builder — and everything it references — out of that reference.
 */
async function fetchPage<TResult>(
  client: ArkivClient,
  request: Readonly<Omit<QueryRequest, "cursor">>,
  cursor: string | undefined,
  decode: (entity: Entity) => TResult | typeof SKIPPED,
): Promise<QueryResult<TResult>> {
  const response = await runQuery(client, { ...request, cursor })
  // withCount() types the count as present, so a node that leaves it out is an error, not a page
  // whose count is silently undefined.
  if (request.count && response.count === undefined) {
    throw new Error("The node returned no count. It may predate the count projection.")
  }

  const results: TResult[] = []
  let skipped = 0
  for (const entity of response.entities) {
    const result = decode(entity)
    if (result === SKIPPED) skipped++
    else results.push(result)
  }

  return new QueryResult<TResult>(
    results,
    response.blockNumber,
    response.cursor,
    skipped,
    response.count,
    (next) => fetchPage(client, request, next, decode),
  )
}
