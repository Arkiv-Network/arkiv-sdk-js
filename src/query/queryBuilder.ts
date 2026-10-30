import type { ArkivClient } from "../clients/baseClient"
import { isSchema, type Schema, SchemaDefinitionError, SchemaMismatchError } from "../schema"
import { QueryBuilderBase } from "./builderBase"
import { runQuery } from "./engine"
import { InvalidPredicateError } from "./errors"
import type { or } from "./expression"
import {
  type asc,
  checkedOrderTerm,
  type desc,
  type OrderCheck,
  type OrderTerm,
  renderOrderBy,
} from "./order"
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
   * `"skip"` (the default) leaves the entity out of the page — so a page can hold fewer rows than
   * its limit, and a page whose every entity was skipped is empty while later pages still have rows.
   * Each page reports how many it left out as {@link QueryResult.skipped}. Arkiv is public, so
   * anyone can write an entity that matches a query but not the schema; skipping keeps one such
   * entity from failing every read of the others. `"throw"` fails the fetch with a
   * {@link SchemaMismatchError} instead.
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
 * {@link or} for alternatives inside one call. {@link orderBy} sorts what they match.
 *
 * @typeParam TSelection - The selection, inferred by `client.select()`.
 * @typeParam TSchema - The schema named with {@link from}, if any.
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { dec } from "@arkiv-network/sdk/schema"
 * import { rabdi } from "@arkiv-network/sdk/chains"
 * import { and, desc, eq, gt } from "@arkiv-network/sdk/query"
 * import { http } from "viem"
 *
 * const client = createPublicClient({ chain: rabdi({ accessKey: "..." }), transport: http() })
 *
 * const page = await client
 *   .select({ $key: true, author: true, title: true })
 *   .from(Posts)
 *   .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
 *   .orderBy(desc("score"))
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
  private _onMismatch: "throw" | "skip" = "skip"
  private _limit: number | undefined
  private _offset: number | undefined
  private _withCount = false
  private _orderBy: OrderTerm | undefined

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
   * or, for a named schema, a tag that does not match — is left out of the page, or fails the fetch
   * with a {@link SchemaMismatchError} with `{ onMismatch: "throw" }`. Columns the selection leaves
   * out are not checked.
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
   * client.select().from(Posts, { onMismatch: "throw" })      // fail on entities that do not fit
   */
  from<S extends Schema>(
    schema: S & SelectionCheck<TSelection, S>,
    options: FromOptions = {},
  ): SelectQueryBuilder<TSelection, S, TCount> {
    if (!isSchema(schema)) {
      throw new SchemaDefinitionError("from() takes a schema built with defineSchema(...)")
    }
    const { onMismatch = "skip" } = options
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
   * Sorts the results by one attribute, with an {@link asc} or {@link desc} key. All the matches
   * are sorted, not each page on its own, and ties come in the node's own order. Calling it again
   * replaces the order. To page with {@link offset}, sort by a key that does not change, such as
   * `asc("$key")`.
   *
   * Any attribute but a bytes one can be sorted on, indexed or not. After `from()`, the key takes
   * its type from the column, and naming anything but a non-bytes column or a queryable system
   * attribute is a compile error. Without a schema, a key on a user attribute names its type. Call
   * it after `from()`: a key given before it is checked against the schema only when the query is
   * sent.
   *
   * @param key - The sort, an `asc(...)` or a `desc(...)`.
   * @throws {InvalidPredicateError} If not given exactly one key, or the key is not one `asc(...)`
   * or `desc(...)` would build. A key that does not fit the schema, or has no type without one,
   * throws when the query is sent.
   *
   * @example
   * builder.orderBy(desc("score"))                       // through a schema
   * builder.orderBy(desc("score", "u256"))               // without one
   * builder.orderBy(asc("$expiresAt"))
   */
  orderBy<const K extends OrderTerm>(key: K & OrderCheck<K, TSchema>): this
  orderBy(...keys: unknown[]): this {
    // The signature takes one key; this catches the callers the type checker does not reach, for
    // whom a second key would otherwise be silently ignored.
    if (keys.length !== 1) {
      throw new InvalidPredicateError("orderBy() takes one key, an asc(...) or desc(...).")
    }
    this._orderBy = checkedOrderTerm(keys[0])
    return this
  }

  /**
   * The query string this builder will send: the filters, as {@link QueryBuilderBase.toString}
   * renders them, followed by the {@link orderBy} clause, if any.
   *
   * @throws {InvalidPredicateError} If no filter has been added, a filter or sort key does not fit
   * the schema, or — without a schema — a sort key on a user attribute has no type.
   */
  override toString(): string {
    const filters = super.toString()
    if (this._orderBy === undefined) return filters
    return `${filters} ${renderOrderBy(this._orderBy, this._schema)}`
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
   * Skips the first `offset` matches. With {@link limit}, this takes one page: page `n` of size
   * `size` is `.limit(size).offset(n * size)`.
   *
   * Every request reads the latest block, so an entity created or deleted between two requests
   * shifts the matches after it, and a row can repeat or be missed. Sort by a key that does not
   * change, such as `asc("$key")`, so that pages line up at least while nothing is written; without
   * {@link orderBy}, the order is the node's own. Through a schema, the offset counts the entities a
   * page skips as well as its rows.
   *
   * To read every match exactly once while others write, page by key instead: sort by
   * `asc("$key")` and filter on `gt("$key", key(lastKey))`, with `lastKey` the last `$key` of the
   * previous page. Through a schema, use `{ onMismatch: "throw" }` for that: a page of skipped
   * entities returns no rows, so no key to continue from.
   *
   * @example
   * builder.orderBy(asc("$key")).limit(20).offset(40) // the third page of 20
   */
  offset(offset: number): this {
    this._offset = offset
    return this
  }

  /**
   * Also counts every entity the query matches, regardless of the limit and offset. The page then
   * carries the total as {@link QueryResult.count}, typed `bigint`, so a paginated list can show it
   * without a second query. To count without fetching rows, use `client.count()` instead.
   *
   * The node counts what the filters match, at the block the page was read at. Through a schema,
   * that includes entities the page leaves out for not fitting it. Later pages read later blocks,
   * so the count can be out of date by the time they arrive.
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
   * Runs the query and returns one page: up to {@link limit} matches, past the first
   * {@link offset}.
   *
   * @throws {InvalidPredicateError} If no filter has been added, or a filter or sort key does not
   * fit the schema.
   * @throws If the {@link limit} is not an integer from 1 to 100, or the {@link offset} is not a
   * non-negative integer.
   * @throws {SchemaMismatchError} If, through a schema, a matching entity does not fit the selected
   * columns or a named schema's tag, and `from()` was given `{ onMismatch: "throw" }`.
   * @throws {QueryError} If the node rejects the query.
   *
   * @example
   * const page = await client.select({ $key: true }).where(eq("category", "docs")).fetch()
   * page.entities
   */
  // Async so that a builder with no filter rejects like every other failure here, rather than
  // throwing synchronously out of a call the caller is awaiting.
  async fetch(): Promise<QueryResult<ResultOf<TSelection, TSchema>, TCount>> {
    const projection = this._projection
    const response = await runQuery(this._client, {
      query: this.toString(),
      select: projection.select,
      limit: this._limit,
      offset: this._offset,
      count: this._withCount,
    })
    // withCount() types the count as present, so a node that leaves it out is an error, not a page
    // whose count is silently undefined.
    if (this._withCount && response.count === undefined) {
      throw new Error("The node returned no count. It may predate the count projection.")
    }

    // Every entity is laid out as a row of the selection — and, through a schema, checked against
    // it. The static narrowing to the selected fields comes from `client.select()`'s inference and
    // nothing at runtime depends on it.
    const rows: ResultOf<TSelection, TSchema>[] = []
    let skipped = 0
    for (const entity of response.entities) {
      try {
        rows.push(toRow(entity, projection) as ResultOf<TSelection, TSchema>)
      } catch (error) {
        if (this._onMismatch === "skip" && error instanceof SchemaMismatchError) skipped++
        else throw error
      }
    }
    return new QueryResult(rows, response.blockNumber, skipped, response.count as TCount)
  }
}
