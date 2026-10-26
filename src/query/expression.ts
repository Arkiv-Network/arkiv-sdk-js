import {
  type ColumnsOf,
  describeColumns,
  type IndexableTypeTag,
  type IndexableValue,
  type IndexedColumnName,
  lookupColumn,
  type Schema,
  type StrValue,
  str,
  type TagOf,
  type TypeTag,
  toValue,
  validateAttributeName,
} from "../schema"
// Internal seam: the typeId table is the protocol's, not part of the package's public surface.
import { isIndexable, TYPE_IDS } from "../schema/types"
import { InvalidPredicateError, UnsupportedOperatorError } from "./errors"

/**
 * The comparison operators the query language defines. Every indexable type accepts all of them;
 * `<` `<=` `>` `>=` compare in index order — numerically for `i32`, `u64`, `u256` and `dec`,
 * `false < true` for `bool`, and by unsigned bytes for `str`, `bytes32`, `addr` and `key`.
 */
export type ComparisonOperator = "=" | "!=" | "<" | "<=" | ">" | ">="

/**
 * A value a predicate can compare against: a value of any indexable type, or a bare boolean,
 * number, bigint or string. `bytes` is excluded — it is never indexed, so never filterable.
 */
export type PredicateValue = IndexableValue | boolean | number | bigint | string

/**
 * `between`'s check that both bounds have one type — `unknown` when they do, and otherwise an
 * object whose one property is named after the problem. No value has that property, so the
 * compiler reports the sentence as the property it is missing.
 */
type SameTypeCheck<L, H> = [TagOf<L>, TagOf<H>] extends [TagOf<H>, TagOf<L>]
  ? unknown
  : { [K in `BETWEEN bounds must have one type, got ${TagOf<L>} and ${TagOf<H>}`]: never }

/**
 * The attribute a predicate names, and the type it asserts — `never` when it asserts none, as
 * `EXISTS` does. Carried by an {@link Expression} at the type level only, so a query against a
 * schema can be checked at compile time: every name must be an indexed column, and every type the
 * column's.
 */
export type AttributeRef = { readonly name: string; readonly type: IndexableTypeTag }

declare const refs: unique symbol

/** The type-level record of the attributes an expression names. Never present at runtime. */
type Refs<R extends AttributeRef> = { readonly [refs]?: R }

/** A comparison between an attribute and a typed literal. */
export interface ComparisonNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "comparison"
  readonly name: string
  readonly operator: ComparisonOperator
  readonly value: IndexableValue
}

/** An inclusive range test, `name BETWEEN low AND high`. Both bounds have one type. */
export interface BetweenNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "between"
  readonly name: string
  readonly low: IndexableValue
  readonly high: IndexableValue
}

/** A `STARTSWITH` prefix test, the language's only pattern operator. */
export interface StartsWithNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "startsWith"
  readonly name: string
  readonly value: StrValue
}

/** An `EXISTS(name)` test — true when the attribute is set with any type. */
export interface ExistsNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "exists"
  readonly name: string
}

/** A `TYPEOF(name) = tag` test. */
export interface TypeOfNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "typeOf"
  readonly name: string
  readonly tag: IndexableTypeTag
}

/** The complement of an expression, evaluated against the active-entity set. */
export interface NotNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "not"
  readonly expression: Expression
}

/** A conjunction. */
export interface AndNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "and"
  readonly expressions: readonly Expression[]
}

/** A disjunction. */
export interface OrNode<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "or"
  readonly expressions: readonly Expression[]
}

/**
 * A query expression: an immutable tree built by the combinators below, whose `toString()` is the
 * exact query string sent over the wire.
 *
 * @typeParam R - The attributes the expression names, as {@link AttributeRef}s — inferred by the
 * combinators, and checked against the schema by `select(...).from(schema).where(...)`.
 *
 * @example
 * const q = and(gte("level", i32(10)), or(eq("status", str("open")), not(exists("closedAt"))))
 * String(q) // level >= i32(10) AND (status = str('open') OR NOT EXISTS(closedAt))
 */
export type Expression<R extends AttributeRef = AttributeRef> =
  | ComparisonNode<R>
  | BetweenNode<R>
  | StartsWithNode<R>
  | ExistsNode<R>
  | TypeOfNode<R>
  | NotNode<R>
  | AndNode<R>
  | OrNode<R>

/** The attributes an expression names — the `R` of an {@link Expression}. */
export type RefsOf<E> = E extends Refs<infer R> ? Exclude<R, undefined> : never

/** The reference a comparison against `V` makes to `N`. */
type ValueRef<N extends string, V> = {
  readonly name: N
  readonly type: TagOf<V> & IndexableTypeTag
}

/**
 * The system attributes a query may filter on, and the type each one carries.
 *
 * Every other system attribute (`$createdAt`, `$updatedAt`, `$creationFlags`) is returned in
 * query results — selected and read back as `createdAt`, `updatedAt` and `creationFlags` — but is
 * not indexed, so it cannot appear in a predicate.
 */
const QUERYABLE_SYSTEM_ATTRIBUTES = {
  $key: "key",
  $owner: "addr",
  $creator: "addr",
  $expiresAt: "u64",
} as const satisfies Record<string, TypeTag>

type SystemAttributeName = keyof typeof QUERYABLE_SYSTEM_ATTRIBUTES

/** The references a filter on a system attribute makes — each with its fixed type. */
export type SystemAttributeRef = {
  [N in SystemAttributeName]: {
    readonly name: N
    readonly type: (typeof QUERYABLE_SYSTEM_ATTRIBUTES)[N]
  }
}[SystemAttributeName]

/**
 * The references a filter through schema `S` may make: each indexed column with its declared
 * type, and the queryable system attributes with theirs. An {@link Expression} naming anything else
 * is a compile error in `select(...).from(S).where(...)`.
 */
export type SchemaRef<S extends Schema> =
  | {
      [K in IndexedColumnName<S>]: {
        readonly name: K
        readonly type: ColumnsOf<S>[K]["type"] & IndexableTypeTag
      }
    }[IndexedColumnName<S>]
  | SystemAttributeRef

/** System attributes a query can ask for but not filter on — they carry no index. */
const RESULT_ONLY_SYSTEM_ATTRIBUTES = ["$createdAt", "$updatedAt", "$creationFlags"]

/**
 * Checks an attribute reference, returning its fixed type when it names a system attribute.
 *
 * User attribute names go through the same grammar the write path enforces, so a name that could
 * never have been written is rejected here rather than matching nothing.
 */
function resolveReference(name: string): TypeTag | undefined {
  if (typeof name !== "string" || !name.startsWith("$")) {
    validateAttributeName(name)
    return undefined
  }
  const system = QUERYABLE_SYSTEM_ATTRIBUTES[name as SystemAttributeName]
  if (system !== undefined) return system

  if (RESULT_ONLY_SYSTEM_ATTRIBUTES.includes(name)) {
    // Selected, and read back, as the entity field of the same name without the `$`.
    const field = name.slice(1)
    throw new InvalidPredicateError(
      `"${name}" is returned in query results but carries no index, so it cannot be filtered ` +
        `on. Select it as \`${field}\` and filter the results in JavaScript instead.`,
      name,
    )
  }
  throw new InvalidPredicateError(
    `"${name}" is not a system attribute. The queryable ones are ` +
      `${Object.keys(QUERYABLE_SYSTEM_ATTRIBUTES).join(", ")}. ` +
      '"$" is reserved for these, so a user attribute cannot be named this.',
    name,
  )
}

/**
 * Whether a string names a type that can be indexed — every type but `bytes`.
 *
 * Takes a `string` rather than an `IndexableTypeTag` on purpose — the callers' static types
 * already say as much, and this is the runtime check for the code that has no types.
 */
function isIndexableTag(tag: string): tag is IndexableTypeTag {
  // `Object.hasOwn` rather than `in`, which would also accept every Object.prototype key.
  return Object.hasOwn(TYPE_IDS, tag) && isIndexable(tag as TypeTag)
}

/** Freezes a node and gives it a (non-enumerable, so still `toEqual`-able) rendering. */
function node<T extends Expression>(value: T): T {
  Object.defineProperty(value, "toString", {
    value: () => render(value),
    enumerable: false,
  })
  return Object.freeze(value)
}

/**
 * Resolves a value a predicate compares `name` against, and checks it can be: not `bytes`, which is
 * never indexed, and of the fixed type when `name` is a system attribute.
 */
function predicateValue(
  name: string,
  system: TypeTag | undefined,
  input: PredicateValue,
): IndexableValue {
  const value = toValue(input, name)
  if (value.type === "bytes") {
    throw new InvalidPredicateError(
      `"${name}" is compared against a bytes value, and bytes are stored but never indexed, so ` +
        "they cannot be filtered on. Index a str, bytes32 or key derived from them instead.",
      name,
    )
  }
  if (system !== undefined && value.type !== system) {
    throw new InvalidPredicateError(
      `"${name}" is a ${system}, but the value is a ${value.type}. ` +
        `System attributes have a fixed type — write ${system}(...) around the value.`,
      name,
    )
  }
  return value
}

function comparison<R extends AttributeRef>(
  name: string,
  operator: ComparisonOperator,
  input: PredicateValue,
): ComparisonNode<R> {
  const value = predicateValue(name, resolveReference(name), input)
  return node({ kind: "comparison", name, operator, value })
}

/**
 * Attribute equals value — set with this exact type, and holding this value.
 *
 * Bare booleans, numbers, bigints and strings take the same default types they take when written
 * (`number` is an `i32`, `bigint` a `u256`, `string` a `str`); anything else names its type.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, a system attribute is compared against the wrong type, or the value is `bytes`.
 *
 * @example
 * eq("status", str("open"))     // status = str('open')
 * eq("flagged", true)           // flagged = true
 * eq("$owner", addr(account))   // $owner = addr(0xd8dA…)
 */
export function eq<N extends string, V extends PredicateValue>(
  name: N,
  value: V,
): ComparisonNode<ValueRef<N, V>> {
  return comparison(name, "=", value)
}

/**
 * Attribute is set with this type and holds a **different** value.
 *
 * This is typed value-negation, not the complement: an entity that never set the attribute, or set
 * it with another type, does not match. Use `not(eq(...))` for the full complement.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, a system attribute is compared against the wrong type, or the value is `bytes`.
 *
 * @example
 * ne("status", str("closed"))          // status != str('closed')
 * not(eq("status", str("closed")))     // NOT status = str('closed') — also matches entities with no status
 */
export function ne<N extends string, V extends PredicateValue>(
  name: N,
  value: V,
): ComparisonNode<ValueRef<N, V>> {
  return comparison(name, "!=", value)
}

/**
 * Attribute is greater than value, in index order — see {@link ComparisonOperator}.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, a system attribute is compared against the wrong type, or the value is `bytes`.
 *
 * @example
 * gt("level", i32(10))              // level > i32(10)
 * gt("$expiresAt", u64(1_200_000n)) // $expiresAt > u64(1200000)
 */
export function gt<N extends string, V extends PredicateValue>(
  name: N,
  value: V,
): ComparisonNode<ValueRef<N, V>> {
  return comparison(name, ">", value)
}

/**
 * Attribute is greater than or equal to value, in index order — see {@link ComparisonOperator}.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, a system attribute is compared against the wrong type, or the value is `bytes`.
 *
 * @example
 * gte("score", dec("3.5")) // score >= dec(3.5)
 */
export function gte<N extends string, V extends PredicateValue>(
  name: N,
  value: V,
): ComparisonNode<ValueRef<N, V>> {
  return comparison(name, ">=", value)
}

/**
 * Attribute is less than value, in index order — see {@link ComparisonOperator}.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, a system attribute is compared against the wrong type, or the value is `bytes`.
 *
 * @example
 * lt("level", i32(10)) // level < i32(10)
 */
export function lt<N extends string, V extends PredicateValue>(
  name: N,
  value: V,
): ComparisonNode<ValueRef<N, V>> {
  return comparison(name, "<", value)
}

/**
 * Attribute is less than or equal to value, in index order — see {@link ComparisonOperator}.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, a system attribute is compared against the wrong type, or the value is `bytes`.
 *
 * @example
 * lte("score", dec("5")) // score <= dec(5)
 */
export function lte<N extends string, V extends PredicateValue>(
  name: N,
  value: V,
): ComparisonNode<ValueRef<N, V>> {
  return comparison(name, "<=", value)
}

/**
 * Attribute lies between two values, **inclusive** at both ends: it matches exactly what
 * `and(gte(name, low), lte(name, high))` matches, in one predicate. Both bounds must have one type,
 * and a `low` above `high` matches nothing.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the bounds have different types, the name starts with `$` but
 * is not a queryable system attribute, a system attribute is compared against the wrong type, or a
 * bound is `bytes`.
 *
 * @example
 * between("score", dec("3.5"), dec("5"))  // score BETWEEN dec(3.5) AND dec(5)
 * between("$expiresAt", u64(100n), u64(200n))
 */
export function between<N extends string, L extends PredicateValue, H extends PredicateValue>(
  name: N,
  low: L,
  high: H & SameTypeCheck<L, H>,
): BetweenNode<ValueRef<N, L>> {
  const system = resolveReference(name)
  const lowValue = predicateValue(name, system, low)
  const highValue = predicateValue(name, system, high)
  if (lowValue.type !== highValue.type) {
    throw new InvalidPredicateError(
      `BETWEEN on "${name}" has a ${lowValue.type} and a ${highValue.type} bound. Both bounds ` +
        "must have one type, the type the attribute is compared as.",
      name,
    )
  }
  return node({ kind: "between", name, low: lowValue, high: highValue })
}

/**
 * Attribute is a `str` beginning with this prefix.
 *
 * The match is on **raw UTF-8 bytes** with no normalization — it is the index encoding, so
 * `startsWith("name", "é")` matches only the same byte sequence, not another normal form of it.
 *
 * @param prefix - The prefix, as a bare string or a `str` value.
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute.
 * @throws {UnsupportedOperatorError} If given a value that is not a `str`, or a system attribute
 * (none of which is a `str`).
 *
 * @example
 * startsWith("desc", "ab") // desc STARTSWITH str('ab')
 */
export function startsWith<N extends string>(
  name: N,
  prefix: string | StrValue,
): StartsWithNode<{ readonly name: N; readonly type: "str" }> {
  const system = resolveReference(name)
  const value = typeof prefix === "string" ? str(prefix) : toValue(prefix, name)
  if (value.type !== "str") {
    throw new UnsupportedOperatorError(
      name,
      "STARTSWITH",
      value.type,
      "Only str carries a prefix index.",
    )
  }
  if (system !== undefined) {
    throw new UnsupportedOperatorError(
      name,
      "STARTSWITH",
      system,
      "No queryable system attribute is a str.",
    )
  }
  return node({ kind: "startsWith", name, value })
}

/**
 * The attribute is set, with any type.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If given a system attribute — every entity has all of them, so
 * the test would be a constant — or a `$` name that is not one.
 *
 * @example
 * exists("reviewedBy")        // EXISTS(reviewedBy)
 * not(exists("closedAt"))     // NOT EXISTS(closedAt)
 */
export function exists<N extends string>(
  name: N,
): ExistsNode<{ readonly name: N; readonly type: never }> {
  if (resolveReference(name) !== undefined) {
    throw new InvalidPredicateError(
      `"${name}" is a system attribute, so it is set on every entity and EXISTS(${name}) is ` +
        "always true.",
      name,
    )
  }
  return node({ kind: "exists", name })
}

/**
 * The attribute is set with exactly this type, whatever its value.
 *
 * Useful when the same name is written with different types across entities — a comparison already
 * asserts the type, so this is for asking about the type alone.
 *
 * @param tag - The type tag: `bool`, `i32`, `u64`, `u256`, `dec`, `bytes32`, `str`, `addr` or
 * `key` — any type but `bytes`, which is never indexed.
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the tag is not an indexable type, the name is a system
 * attribute (whose type is fixed), or the name starts with `$` but is not a system attribute.
 *
 * @example
 * hasType("age", "i32") // TYPEOF(age) = i32
 */
export function hasType<N extends string, T extends IndexableTypeTag>(
  name: N,
  tag: T,
): TypeOfNode<{ readonly name: N; readonly type: T }> {
  const system = resolveReference(name)
  if (system !== undefined) {
    throw new InvalidPredicateError(
      `"${name}" is always a ${system} — a system attribute has a fixed type, so ` +
        `TYPEOF(${name}) is a constant.`,
      name,
    )
  }
  if (!isIndexableTag(tag)) {
    throw new InvalidPredicateError(
      `"${tag}" is not an indexable attribute type. Use one of ` +
        "bool, i32, u64, u256, dec, bytes32, str, addr, key.",
      name,
    )
  }
  return node({ kind: "typeOf", name, tag })
}

/**
 * The complement of an expression, evaluated against the set of live entities — unlike `!=`, it
 * matches entities that never set the attribute at all.
 *
 * @example
 * not(exists("closedAt"))            // NOT EXISTS(closedAt)
 * not(and(eq("a", 1), eq("b", 2)))   // NOT (a = i32(1) AND b = i32(2))
 */
export function not<R extends AttributeRef>(expression: Expression<R>): NotNode<R> {
  return node({ kind: "not", expression })
}

/**
 * All of these must hold.
 *
 * A single expression is returned unwrapped, so building a conjunction from a filtered list does
 * not litter the query with redundant nesting.
 *
 * @param expressions - The expressions, as separate arguments or one array.
 * @throws {InvalidPredicateError} If given nothing to combine.
 *
 * @example
 * and(gte("level", i32(10)), eq("status", "open"))
 * and(filters) // an array works too
 */
export function and<const E extends readonly Expression[]>(
  expressions: E,
): Expression<RefsOf<E[number]>>
export function and<const E extends readonly Expression[]>(
  ...expressions: E
): Expression<RefsOf<E[number]>>
export function and(...expressions: (Expression | readonly Expression[])[]): Expression {
  return combine("and", expressions.flat())
}

/**
 * At least one of these must hold.
 *
 * A single expression is returned unwrapped.
 *
 * @param expressions - The expressions, as separate arguments or one array.
 * @throws {InvalidPredicateError} If given nothing to combine.
 *
 * @example
 * or(eq("status", "open"), not(exists("closedAt")))
 */
export function or<const E extends readonly Expression[]>(
  expressions: E,
): Expression<RefsOf<E[number]>>
export function or<const E extends readonly Expression[]>(
  ...expressions: E
): Expression<RefsOf<E[number]>>
export function or(...expressions: (Expression | readonly Expression[])[]): Expression {
  return combine("or", expressions.flat())
}

function combine(kind: "and" | "or", expressions: Expression[]): Expression {
  if (expressions.length === 0) {
    throw new InvalidPredicateError(
      `${kind}() needs at least one expression. An empty ${kind === "and" ? "conjunction" : "disjunction"} ` +
        `has no query-language spelling — leave the ${kind}() out. A query still needs at least one ` +
        "filter, so to match broadly narrow by owner or creator, or read through a named schema, " +
        "whose tag counts as one.",
    )
  }
  // A one-element conjunction *is* its element; keeping the wrapper would only add parentheses.
  const only = expressions[0]
  if (expressions.length === 1 && only !== undefined) return only
  return node(
    kind === "and"
      ? { kind: "and", expressions: Object.freeze(expressions) }
      : { kind: "or", expressions: Object.freeze(expressions) },
  )
}

/**
 * Checks every attribute an expression names against a schema — the runtime half of the check
 * {@link SchemaRef} makes at compile time, for the callers the type system does not reach.
 *
 * @throws {InvalidPredicateError} If a predicate names something that is not a column of the
 * schema, a column that is not indexed, or compares a column against a value of another type.
 */
export function checkAgainstSchema(expression: Expression, schema: Schema): void {
  switch (expression.kind) {
    case "not":
      checkAgainstSchema(expression.expression, schema)
      return
    case "and":
    case "or":
      for (const sub of expression.expressions) checkAgainstSchema(sub, schema)
      return
  }

  const { name } = expression
  // System attributes were checked against their fixed types when the predicate was built.
  if (name.startsWith("$")) return

  const column = lookupColumn(schema, name)
  if (column === undefined) {
    throw new InvalidPredicateError(
      `"${name}" is not a column of the schema, so a predicate on it can only match entities ` +
        `written some other way. Its columns are ${describeColumns(schema)}.`,
      name,
    )
  }
  if (!column.isIndexed) {
    if (column.type === "bytes") {
      throw new InvalidPredicateError(
        `"${name}" is a bytes column, and bytes are stored but never indexed, so it cannot be ` +
          "filtered on. Index a str, bytes32 or key derived from it instead, or select it and " +
          "filter the results in JavaScript.",
        name,
      )
    }
    throw new InvalidPredicateError(
      `"${name}" is not indexed, and only indexed attributes can be filtered on. Declare it ` +
        `${column.type}().indexed() — entities written before that are indexed by their next ` +
        "patch of it — or select it and filter the results in JavaScript.",
      name,
    )
  }
  const asserted =
    expression.kind === "comparison" || expression.kind === "startsWith"
      ? expression.value.type
      : expression.kind === "between"
        ? expression.low.type
        : expression.kind === "typeOf"
          ? expression.tag
          : undefined
  if (asserted !== undefined && asserted !== column.type) {
    throw new InvalidPredicateError(
      `"${name}" is a ${column.type} column, but the predicate asserts a ${asserted}, so it could ` +
        `never match. Write ${column.type}(...) around the value.`,
      name,
    )
  }
}

/**
 * Binding strength, tightest last — `NOT` binds tighter than `AND`, which binds tighter than `OR`.
 * A leaf never needs parentheses, so it sits above them all.
 */
const PRECEDENCE = { or: 1, and: 2, not: 3, leaf: 4 } as const

function precedenceOf(expression: Expression): number {
  switch (expression.kind) {
    case "or":
      return PRECEDENCE.or
    case "and":
      return PRECEDENCE.and
    case "not":
      return PRECEDENCE.not
    default:
      return PRECEDENCE.leaf
  }
}

/** Renders a subexpression, parenthesising it only where the precedence would otherwise change it. */
function nested(expression: Expression, minimum: number): string {
  const rendered = render(expression)
  return precedenceOf(expression) < minimum ? `(${rendered})` : rendered
}

/**
 * Renders an expression as the query string the node parses. Equivalent to `String(expression)`.
 *
 * Literals are always written tagged, even where the language would infer them: an untagged number
 * defaults to `i32`, but spelling it `i32(10)` keeps the exact-type assertion visible in the query
 * that actually went over the wire.
 */
export function render(expression: Expression): string {
  switch (expression.kind) {
    case "comparison":
      return `${expression.name} ${expression.operator} ${renderLiteral(expression.value)}`
    case "between":
      // A leaf, never parenthesised: the AND inside BETWEEN belongs to it, so
      // `a BETWEEN 1 AND 5 AND b = 2` already reads as `(a BETWEEN 1 AND 5) AND b = 2`.
      return `${expression.name} BETWEEN ${renderLiteral(expression.low)} AND ${renderLiteral(expression.high)}`
    case "startsWith":
      return `${expression.name} STARTSWITH ${renderLiteral(expression.value)}`
    case "exists":
      return `EXISTS(${expression.name})`
    case "typeOf":
      return `TYPEOF(${expression.name}) = ${expression.tag}`
    case "not":
      return `NOT ${nested(expression.expression, PRECEDENCE.not)}`
    case "and":
      return expression.expressions.map((sub) => nested(sub, PRECEDENCE.and)).join(" AND ")
    case "or":
      return expression.expressions.map((sub) => nested(sub, PRECEDENCE.or)).join(" OR ")
  }
}

/** Renders a typed value as its query literal. `bool` is the one type written bare. */
function renderLiteral(value: IndexableValue): string {
  switch (value.type) {
    case "bool":
      return value.value ? "true" : "false"
    case "i32":
      return `i32(${value.value})`
    case "u64":
      return `u64(${value.value})`
    case "u256":
      return `u256(${value.value})`
    case "dec":
      return `dec(${value.value})`
    case "bytes32":
      return `bytes32(${value.value})`
    case "key":
      return `key(${value.value})`
    case "addr":
      return `addr(${value.value})`
    case "str":
      // Single-quoted, with '' as the escape for a quote — the language has no backslash escapes.
      return `str('${value.value.replaceAll("'", "''")}')`
  }
}
