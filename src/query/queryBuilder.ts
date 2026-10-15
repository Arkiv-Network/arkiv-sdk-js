import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import {
  addr,
  type ColumnsOf,
  isSchema,
  SCHEMA_ATTRIBUTE,
  type Schema,
  SchemaDefinitionError,
  SchemaMismatchError,
} from "../schema"
import type { Entity } from "../types/entity"
import { type QueryRequest, runQuery } from "./engine"
import { InvalidPredicateError } from "./errors"
import {
  and,
  checkAgainstSchema,
  type Expression,
  eq,
  type or,
  type RefsOf,
  type SchemaRef,
} from "./expression"
import { QueryResult } from "./queryResult"
import {
  type DynamicSelection,
  projectSchema,
  type ResultOf,
  type SelectArg,
  type Selection,
  type SelectionFields,
  toRow,
  toRpcSelect,
  type UnknownSelection,
} from "./selection"

/** The expressions in a `where` call — passed one by one, or as one array. */
type WhereExpressions<E extends readonly (Expression | readonly Expression[])[]> =
  E[number] extends infer X ? (X extends readonly Expression[] ? X[number] : X) : never

/**
 * Human-readable messages for compile-time errors when a filter does not fit the schema.
 */
type FilterProblem<R, S extends Schema> = R extends {
  readonly name: infer N extends string
  readonly type: infer T extends string
}
  ? R extends SchemaRef<S>
    ? never
    : N extends SchemaRef<S>["name"]
      ? `"${N}" has type ${Extract<SchemaRef<S>, { name: N }>["type"]}, but is compared against a value of type ${T}`
      : N extends keyof ColumnsOf<S>
        ? `"${N}" is not indexed, so it cannot be filtered on. Declare it ${ColumnsOf<S>[N]["type"]}().indexed() to filter on it`
        : `"${N}" is not a column of this schema`
  : never

/**
 * `where`'s check that every filter fits the schema — `unknown` when it does, or when there is no
 * schema, and otherwise an object whose one property is named after the problem. No expression has
 * that property, so the compiler reports the sentence as the property it is missing.
 */
type FilterCheck<
  E extends readonly (Expression | readonly Expression[])[],
  TSchema,
> = TSchema extends Schema
  ? [FilterProblem<RefsOf<WhereExpressions<E>>, TSchema>] extends [infer P extends string]
    ? [P] extends [never]
      ? unknown
      : { [K in P]: never }
    : unknown
  : unknown

/**
 * `from(schema)`'s check that every selected key is an entity field or a column — `unknown` when
 * it holds, and an object naming the offenders, which no schema satisfies, when it does not.
 */
type SelectionCheck<TSelection, TSchema extends Schema> = [
  UnknownSelection<TSelection, TSchema>,
] extends [never]
  ? unknown
  : { "selected names that are not columns of this schema": UnknownSelection<TSelection, TSchema> }

/** How a query through a schema treats a matching entity that does not fit the schema. */
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
 * `fetch()`'s guard against a selection that names columns but never named their schema — the
 * builder itself when that is not the case, and a message no builder satisfies when it is.
 */
type Fetchable<TSelection, TSchema extends Schema | undefined, TBuilder> = TSchema extends Schema
  ? TBuilder
  : TSelection extends "*" | DynamicSelection
    ? TBuilder
    : [Exclude<keyof TSelection, keyof SelectionFields>] extends [never]
      ? TBuilder
      : "select() names columns; call .from(schema) to say which schema they belong to"

/**
 * Builds and runs a query.
 *
 * The selection is fixed when the builder is created and the filter is added by chaining, so the
 * result type is known before a single predicate is written. Create one with `client.select(...)`
 * rather than constructing it directly — that is what infers the result shape from the selection.
 *
 * Without a schema, the query returns {@link Entity} objects narrowed to the selection. Name a
 * schema with {@link from} to get flat, typed rows instead — and to have `where` checked against
 * it, so that filtering on a column the schema does not index, or comparing one against the wrong
 * type, is a compile error.
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
 *   .select({ key: true, author: true, title: true })
 *   .from(Posts)
 *   .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
 *   .limit(20)
 *   .fetch()
 *
 * for (const row of page.entities) console.log(row.key, row.title.value)
 */
export class SelectQueryBuilder<TSelection = "*", TSchema extends Schema | undefined = undefined> {
  private readonly _client: ArkivClient
  private readonly _selection: SelectArg | Selection | undefined
  private _schema: Schema | undefined
  private _onMismatch: "throw" | "skip" = "throw"
  private readonly _filters: Expression[] = []
  private _ownedBy: Expression | undefined
  private _createdBy: Expression | undefined
  private _limit: number | undefined
  private _cursor: string | undefined
  private _atBlock: bigint | undefined

  constructor(client: ArkivClient, selection?: SelectArg | Selection) {
    this._client = client
    this._selection = selection
  }

  /**
   * Runs the query through a schema. The results become flat rows — the selected entity fields
   * and columns side by side, each column typed as the schema declares — and `where` is checked
   * against the schema's indexed columns.
   *
   * A named schema also filters: only entities tagged with its name match, so a query through it
   * sees only entities written through it, and needs no other filter. An unnamed schema types the
   * query without filtering it — `where` alone decides which entities match.
   *
   * A matching entity that does not fit the schema — a required column missing, or of another
   * type — fails the fetch with a {@link SchemaMismatchError}, or is left out of the page with
   * `{ onMismatch: "skip" }`.
   *
   * Returns a new builder, carrying whatever this one already holds; this one is left as it was.
   *
   * @param schema - The schema, built with `defineSchema`.
   * @param options - How to treat entities that do not fit. {@link FromOptions}
   * @throws {SchemaDefinitionError} If `schema` was not built with `defineSchema`.
   *
   * @example
   * client.select({ key: true, title: true }).from(Posts)    // rows typed { key; title }
   * client.select().from(Posts)                               // every field and every column
   * client.select().from(Posts, { onMismatch: "skip" })       // leave out entities that do not fit
   */
  from<S extends Schema>(
    schema: S & SelectionCheck<TSelection, S>,
    options: FromOptions = {},
  ): SelectQueryBuilder<TSelection, S> {
    if (!isSchema(schema)) {
      throw new SchemaDefinitionError("from() takes a schema built with defineSchema(...)")
    }
    const { onMismatch = "throw" } = options
    if (onMismatch !== "throw" && onMismatch !== "skip") {
      throw new TypeError(`onMismatch must be "throw" or "skip", got ${String(onMismatch)}`)
    }
    // A copy, not `this` re-typed: a builder typed for one schema must never be the same object as
    // one typed for another, or `base.from(Posts)` and `base.from(Users)` would share their state.
    const typed = new SelectQueryBuilder<TSelection, S>(this._client, this._selection)
    typed._schema = schema
    typed._onMismatch = onMismatch
    typed._filters.push(...this._filters)
    typed._ownedBy = this._ownedBy
    typed._createdBy = this._createdBy
    typed._limit = this._limit
    typed._cursor = this._cursor
    typed._atBlock = this._atBlock
    return typed
  }

  /**
   * Adds filters. Everything passed here, and across repeated calls, must hold.
   *
   * After {@link from}, every attribute a filter names must be an indexed column of the schema,
   * compared against a value of its type — anything else is a compile error.
   *
   * @param expressions - The expressions, as separate arguments or one array.
   *
   * @example
   * builder.where(eq("category", "docs"))
   * builder.where(gte("level", i32(10)), lt("level", i32(20)))
   * builder.where(or(eq("status", "open"), not(exists("closedAt"))))
   */
  where<const E extends readonly (Expression | readonly Expression[])[]>(
    ...expressions: E & FilterCheck<E, TSchema>
  ): this {
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
   * selection it came from, so it must be used with an identically-built query.
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
   * @throws {InvalidPredicateError} If no filter has been added, or — after {@link from} — a
   * filter does not fit the schema. A named schema's own tag filter counts as a filter.
   */
  toString(): string {
    const schema = this._schema
    const filters = [...this._filters]
    if (this._ownedBy) filters.push(this._ownedBy)
    if (this._createdBy) filters.push(this._createdBy)
    if (schema !== undefined) {
      for (const filter of filters) checkAgainstSchema(filter, schema)
      // Added after the check: the tag is not a column, and the caller never wrote this filter.
      if (schema.tag !== undefined) filters.unshift(eq(SCHEMA_ATTRIBUTE, schema.tag))
    }
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
   * @throws {InvalidPredicateError} If no filter has been added, or a filter does not fit the
   * schema.
   * @throws {SchemaMismatchError} If, through a schema, a matching entity does not fit it — unless
   * `from()` was given `{ onMismatch: "skip" }`.
   * @throws {QueryError} If the node rejects the query.
   *
   * @example
   * const page = await client.select({ key: true }).where(eq("category", "docs")).fetch()
   * page.entities        // this page
   * await page.next()    // the next one
   */
  fetch(
    this: Fetchable<TSelection, TSchema, SelectQueryBuilder<TSelection, TSchema>>,
  ): Promise<QueryResult<ResultOf<TSelection, TSchema>>> {
    return (this as SelectQueryBuilder<TSelection, TSchema>).fetchFirstPage()
  }

  // Async so that a builder with no filter rejects like every other failure here, rather than
  // throwing synchronously out of a call the caller is awaiting.
  private async fetchFirstPage(): Promise<QueryResult<ResultOf<TSelection, TSchema>>> {
    // Snapshot the request here, so the pages of one walk are all pages of the *same* query. The
    // builder stays mutable and reusable; a cursor is bound to the query, block and selection it
    // was issued for, so re-reading a since-edited builder would page with a mismatched cursor.
    const schema = this._schema
    const projection =
      schema === undefined ? undefined : projectSchema(this._selection as Selection, schema)
    const request = Object.freeze({
      query: this.toString(),
      select: projection?.select ?? toRpcSelect(this._selection),
      limit: this._limit,
      atBlock: this._atBlock,
    })
    // Every row decodes to a full Entity; through a schema it is laid out as a row and checked.
    // The static narrowing to the selected fields comes from `client.select()`'s inference and
    // nothing at runtime depends on it.
    const skip = this._onMismatch === "skip"
    const decode = (
      projection === undefined
        ? (entity: Entity) => entity
        : (entity: Entity) => {
            try {
              return toRow(entity, projection)
            } catch (error) {
              if (skip && error instanceof SchemaMismatchError) return SKIPPED
              throw error
            }
          }
    ) as (entity: Entity) => ResultOf<TSelection, TSchema> | typeof SKIPPED
    return fetchPage(this._client, request, this._cursor, decode)
  }

  /**
   * Walks every page, yielding one entity at a time.
   *
   * @example
   * for await (const entity of client.select({ key: true }).where(eq("category", "docs"))) {
   *   console.log(entity.key)
   * }
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<ResultOf<TSelection, TSchema>> {
    let page: QueryResult<ResultOf<TSelection, TSchema>> | undefined = await this.fetchFirstPage()
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

  const results: TResult[] = []
  let skipped = 0
  for (const entity of response.entities) {
    const result = decode(entity)
    if (result === SKIPPED) skipped++
    else results.push(result)
  }

  return new QueryResult<TResult>(results, response.blockNumber, response.cursor, skipped, (next) =>
    fetchPage(client, request, next, decode),
  )
}
