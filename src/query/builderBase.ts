import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import { addr, type ColumnsOf, SCHEMA_ATTRIBUTE, type Schema } from "../schema"
import { InvalidPredicateError } from "./errors"
import {
  and,
  checkAgainstSchema,
  type Expression,
  eq,
  type RefsOf,
  type SchemaRef,
} from "./expression"

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
        ? ColumnsOf<S>[N]["type"] extends "bytes"
          ? `"${N}" is a bytes column, and bytes are never indexed, so it cannot be filtered on. Index a str, bytes32 or key derived from it instead`
          : `"${N}" is not indexed, so it cannot be filtered on. Declare it ${ColumnsOf<S>[N]["type"]}().indexed() to filter on it`
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
 * What every query builder shares: the client, the filters — `where`, `ownedBy`, `createdBy` and a
 * named schema's tag — and the block to read at. `client.select()` and `client.count()` build on it,
 * so the same filters always send the same query string, whichever of them runs it.
 *
 * Not constructed directly: create a builder with `client.select(...)` or `client.count()`.
 *
 * @typeParam TSchema - The schema named with `from()`, if any, which `where` is checked against.
 */
export abstract class QueryBuilderBase<TSchema extends Schema | undefined = undefined> {
  protected readonly _client: ArkivClient
  protected _schema: Schema | undefined
  protected readonly _filters: Expression[] = []
  protected _ownedBy: Expression | undefined
  protected _createdBy: Expression | undefined
  protected _atBlock: bigint | undefined

  constructor(client: ArkivClient) {
    this._client = client
  }

  /**
   * This builder's state in a new builder of the same class, re-typed by the caller. Every field is
   * carried over, so one a subclass adds is not dropped by `from()`; the filter list, which is
   * mutated in place, is copied rather than shared.
   *
   * A copy, not `this` re-typed: a builder typed for one schema must never be the same object as
   * one typed for another, or `base.from(Posts)` and `base.from(Users)` would share their state.
   */
  protected copy<B extends QueryBuilderBase<Schema | undefined>>(): B {
    const copy = Object.create(Object.getPrototypeOf(this)) as B
    return Object.assign(copy, this, { _filters: [...this._filters] })
  }

  /**
   * Adds filters. Everything passed here, and across repeated calls, must hold.
   *
   * After `from()`, every attribute a filter names must be an indexed column of the schema,
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
   * Restricts the query to entities this account owns — shorthand for
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
   * Restricts the query to entities this account created — shorthand for
   * `where(eq("$creator", addr(creator)))`. Calling it again replaces the filter.
   *
   * The creator never changes; the owner does, so these differ after a transfer.
   */
  createdBy(creator: Hex): this {
    this._createdBy = eq("$creator", addr(creator))
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
   * The query string this builder will send — the same text the node parses: its filters,
   * `ownedBy` and `createdBy`, and a named schema's tag, ANDed.
   *
   * @throws {InvalidPredicateError} If no filter has been added, or — after `from()` — a filter
   * does not fit the schema. A named schema's own tag filter counts as a filter.
   */
  toString(): string {
    const filters = [...this._filters]
    if (this._ownedBy) filters.push(this._ownedBy)
    if (this._createdBy) filters.push(this._createdBy)
    const schema = this._schema
    if (schema !== undefined) {
      for (const filter of filters) checkAgainstSchema(filter, schema)
      // Added after the check: the tag is not a column, and the caller never wrote this filter.
      if (schema.tag !== undefined) filters.unshift(eq(SCHEMA_ATTRIBUTE, schema.tag))
    }
    if (filters.length === 0) {
      throw new InvalidPredicateError(
        "A query needs at least one filter — the language has no spelling for 'match every " +
          "entity'. Add a where(...) predicate, or narrow by ownedBy(...) / createdBy(...).",
      )
    }
    return and(filters).toString()
  }
}
