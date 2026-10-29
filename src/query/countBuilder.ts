import { isSchema, type Schema, SchemaDefinitionError } from "../schema"
import { QueryBuilderBase } from "./builderBase"
import { runQuery } from "./engine"

/**
 * Builds and runs a count: how many entities a query matches, without fetching any of them.
 *
 * It filters exactly as `client.select()` does — {@link from}, `where`, `ownedBy` and `createdBy`
 * are the same methods, from the same base — but has nothing to select and no pages, so
 * {@link fetch} resolves to a `bigint`. Create one with `client.count()`.
 *
 * To show the total next to a page of rows, use `select(...).withCount()` instead, which counts in
 * the same request.
 *
 * @typeParam TSchema - The schema named with {@link from}, if any.
 *
 * @example
 * const total = await client.count().from(Posts).ownedBy(account.address).fetch()
 */
export class CountQueryBuilder<
  TSchema extends Schema | undefined = undefined,
> extends QueryBuilderBase<TSchema> {
  /**
   * Counts through a schema: `where` is checked against its indexed columns, and a named schema
   * counts only entities tagged with its name — so it needs no other filter.
   *
   * Returns a new builder, carrying whatever this one already holds; this one is left as it was.
   *
   * @throws {SchemaDefinitionError} If `schema` was not built with `defineSchema`.
   *
   * @example
   * client.count().from(Posts)   // every post
   */
  from<S extends Schema>(schema: S): CountQueryBuilder<S> {
    if (!isSchema(schema)) {
      throw new SchemaDefinitionError("from() takes a schema built with defineSchema(...)")
    }
    const typed = this.copy<CountQueryBuilder<S>>()
    typed._schema = schema
    return typed
  }

  /**
   * Runs the count.
   *
   * Counts every entity the filters match at the block, whether or not it fits the schema — what
   * `select().from(schema)` leaves out of its pages is still counted.
   *
   * @throws {InvalidPredicateError} If no filter has been added, or a filter does not fit the
   * schema.
   * @throws {QueryError} If the node rejects the query.
   * @throws If the node returns no count — it predates the count projection.
   */
  async fetch(): Promise<bigint> {
    // Nothing but the count is selected, so the node returns no rows and no cursor.
    const response = await runQuery(this._client, {
      query: this.toString(),
      select: {},
      count: true,
    })
    if (response.count === undefined) {
      throw new Error("The node returned no count. It may predate the count projection.")
    }
    return response.count
  }
}
