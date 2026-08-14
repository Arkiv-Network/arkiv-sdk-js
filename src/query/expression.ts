import {
  type ArkivValue,
  type StrValue,
  str,
  type TypeTag,
  toValue,
  type UserTypeTag,
  type ValueInput,
  validateAttributeName,
} from "../attr"
// Internal seam: the typeId table is the protocol's, not part of the package's public surface.
import { TYPE_IDS } from "../attr/types"
import { InvalidPredicateError, UnsupportedOperatorError } from "./errors"

export type ComparisonOperator = "=" | "!=" | "<" | "<=" | ">" | ">="

/** A comparison between an attribute and a typed literal. */
export type ComparisonNode = {
  readonly kind: "comparison"
  readonly name: string
  readonly operator: ComparisonOperator
  readonly value: ArkivValue
}

/** A `STARTSWITH` prefix test, the language's only pattern operator. */
export type StartsWithNode = {
  readonly kind: "startsWith"
  readonly name: string
  readonly value: StrValue
}

/** An `EXISTS(name)` test — true when the attribute is set with any type. */
export type ExistsNode = {
  readonly kind: "exists"
  readonly name: string
}

/** A `TYPEOF(name) = tag` test. */
export type TypeOfNode = {
  readonly kind: "typeOf"
  readonly name: string
  readonly tag: UserTypeTag
}

/** The complement of an expression, evaluated against the active-entity set. */
export type NotNode = {
  readonly kind: "not"
  readonly expression: Expression
}

/** A conjunction. */
export type AndNode = {
  readonly kind: "and"
  readonly expressions: readonly Expression[]
}

/** A disjunction. */
export type OrNode = {
  readonly kind: "or"
  readonly expressions: readonly Expression[]
}

/**
 * A query expression: an immutable tree built by the combinators below, whose `toString()` is the
 * exact query string sent over the wire.
 *
 * @example
 * const q = and(gte("level", i32(10)), or(eq("status", str("open")), not(exists("closedAt"))))
 * String(q) // level >= i32(10) AND (status = str('open') OR NOT EXISTS(closedAt))
 */
export type Expression =
  | ComparisonNode
  | StartsWithNode
  | ExistsNode
  | TypeOfNode
  | NotNode
  | AndNode
  | OrNode

/**
 * The system attributes a query may filter on, and the type each one carries.
 *
 * Every other system attribute (`$createdAt`, `$updatedAt`, `$creationFlags`, `$contentType`,
 * `$payload`) is returned in query results but is not indexed, so it cannot appear in a predicate.
 */
const QUERYABLE_SYSTEM_ATTRIBUTES = {
  $key: "key",
  $owner: "addr",
  $creator: "addr",
  $expiresAt: "u64",
} as const satisfies Record<string, TypeTag>

type SystemAttributeName = keyof typeof QUERYABLE_SYSTEM_ATTRIBUTES

/** System attributes a query can ask for but not filter on — they carry no index. */
const RESULT_ONLY_SYSTEM_ATTRIBUTES = [
  "$createdAt",
  "$updatedAt",
  "$creationFlags",
  "$contentType",
  "$payload",
]

/** The types that carry an ordered index, and so accept `<` `<=` `>` `>=`. */
const ORDERED_TAGS: ReadonlySet<TypeTag> = new Set<TypeTag>(["i32", "u64", "u256", "dec"])

const RANGE_OPERATORS: ReadonlySet<ComparisonOperator> = new Set<ComparisonOperator>([
  "<",
  "<=",
  ">",
  ">=",
])

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
    throw new InvalidPredicateError(
      `"${name}" is returned in query results but carries no index, so it cannot be filtered ` +
        "on. Select it and filter the results in JavaScript instead.",
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
 * Whether a string names a type a client may set. `bytes` is excluded: it backs `$payload`, which
 * is neither settable nor queryable.
 *
 * Takes a `string` rather than a `UserTypeTag` on purpose — the callers' static types already say
 * as much, and this is the runtime check for the code that has no types.
 */
function isUserTypeTag(tag: string): tag is UserTypeTag {
  // `Object.hasOwn` rather than `in`, which would also accept every Object.prototype key.
  return Object.hasOwn(TYPE_IDS, tag) && tag !== "bytes"
}

/** Freezes a node and gives it a (non-enumerable, so still `toEqual`-able) rendering. */
function node<T extends Expression>(value: T): T {
  Object.defineProperty(value, "toString", {
    value: () => render(value),
    enumerable: false,
  })
  return Object.freeze(value)
}

function comparison(name: string, operator: ComparisonOperator, input: ValueInput): ComparisonNode {
  const system = resolveReference(name)
  const value = toValue(input, name)

  if (system !== undefined && value.type !== system) {
    throw new InvalidPredicateError(
      `"${name}" is a ${system}, but the value is a ${value.type}. ` +
        `System attributes have a fixed type — write ${system}(...) around the value.`,
      name,
    )
  }
  if (RANGE_OPERATORS.has(operator) && !ORDERED_TAGS.has(value.type)) {
    throw new UnsupportedOperatorError(
      name,
      operator,
      value.type,
      `Only i32, u64, u256 and dec carry an ordered index; ${value.type} is equality-only.`,
    )
  }
  return node({ kind: "comparison", name, operator, value })
}

/**
 * Attribute equals value — set with this exact type, and holding this value.
 *
 * Bare booleans, numbers, bigints and strings take the same default types they take when written
 * (`number` is an `i32`, `bigint` a `u256`, `string` a `str`); anything else names its type.
 *
 * @throws {InvalidPredicateError} If the name is not a queryable attribute, or a system attribute
 * is compared against the wrong type.
 *
 * @example
 * eq("status", str("open"))     // status = str('open')
 * eq("flagged", true)           // flagged = true
 * eq("$owner", addr(account))   // $owner = addr(0xd8dA…)
 */
export function eq(name: string, value: ValueInput): ComparisonNode {
  return comparison(name, "=", value)
}

/**
 * Attribute is set with this type and holds a **different** value.
 *
 * This is typed value-negation, not the complement: an entity that never set the attribute, or set
 * it with another type, does not match. Use `not(eq(...))` for the full complement.
 *
 * @example
 * ne("status", str("closed"))          // status != str('closed')
 * not(eq("status", str("closed")))     // NOT status = str('closed') — also matches entities with no status
 */
export function ne(name: string, value: ValueInput): ComparisonNode {
  return comparison(name, "!=", value)
}

/**
 * Attribute is greater than value. Ordered types only (`i32`, `u256`, `dec`).
 *
 * @throws {UnsupportedOperatorError} If the value's type carries no ordered index.
 *
 * @example
 * gt("level", i32(10))              // level > i32(10)
 * gt("$expiresAt", u64(1_200_000n)) // $expiresAt > u64(1200000)
 */
export function gt(name: string, value: ValueInput): ComparisonNode {
  return comparison(name, ">", value)
}

/**
 * Attribute is greater than or equal to value. Ordered types only (`i32`, `u256`, `dec`).
 *
 * @throws {UnsupportedOperatorError} If the value's type carries no ordered index.
 *
 * @example
 * gte("score", dec("3.5")) // score >= dec(3.5)
 */
export function gte(name: string, value: ValueInput): ComparisonNode {
  return comparison(name, ">=", value)
}

/**
 * Attribute is less than value. Ordered types only (`i32`, `u256`, `dec`).
 *
 * @throws {UnsupportedOperatorError} If the value's type carries no ordered index.
 *
 * @example
 * lt("level", i32(10)) // level < i32(10)
 */
export function lt(name: string, value: ValueInput): ComparisonNode {
  return comparison(name, "<", value)
}

/**
 * Attribute is less than or equal to value. Ordered types only (`i32`, `u256`, `dec`).
 *
 * @throws {UnsupportedOperatorError} If the value's type carries no ordered index.
 *
 * @example
 * lte("score", dec("5")) // score <= dec(5)
 */
export function lte(name: string, value: ValueInput): ComparisonNode {
  return comparison(name, "<=", value)
}

/**
 * Attribute is a `str` beginning with this prefix.
 *
 * The match is on **raw UTF-8 bytes** with no normalization — it is the index encoding, so
 * `startsWith("name", "é")` matches only the same byte sequence, not another normal form of it.
 *
 * @param prefix - The prefix, as a bare string or a `str` value.
 * @throws {UnsupportedOperatorError} If given a value that is not a `str`.
 *
 * @example
 * startsWith("desc", "ab") // desc STARTSWITH str('ab')
 */
export function startsWith(name: string, prefix: string | StrValue): StartsWithNode {
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
 * @throws {InvalidPredicateError} If given a system attribute — every entity has all of them, so
 * the test would be a constant.
 *
 * @example
 * exists("reviewedBy")        // EXISTS(reviewedBy)
 * not(exists("closedAt"))     // NOT EXISTS(closedAt)
 */
export function exists(name: string): ExistsNode {
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
 * @param tag - The type tag: `bool`, `i32`, `u256`, `dec`, `bytes32`, `str`, `addr` or `key`.
 * @throws {InvalidPredicateError} If the tag is not a settable type, or the name is a system
 * attribute (whose type is fixed).
 *
 * @example
 * hasType("age", "i32") // TYPEOF(age) = i32
 */
export function hasType(name: string, tag: UserTypeTag): TypeOfNode {
  const system = resolveReference(name)
  if (system !== undefined) {
    throw new InvalidPredicateError(
      `"${name}" is always a ${system} — a system attribute has a fixed type, so ` +
        `TYPEOF(${name}) is a constant.`,
      name,
    )
  }
  if (!isUserTypeTag(tag)) {
    throw new InvalidPredicateError(
      `"${tag}" is not a settable attribute type. Use one of ` +
        "bool, i32, u256, dec, bytes32, str, addr, key.",
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
export function not(expression: Expression): NotNode {
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
export function and(expressions: readonly Expression[]): Expression
export function and(...expressions: Expression[]): Expression
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
export function or(expressions: readonly Expression[]): Expression
export function or(...expressions: Expression[]): Expression
export function or(...expressions: (Expression | readonly Expression[])[]): Expression {
  return combine("or", expressions.flat())
}

function combine(kind: "and" | "or", expressions: Expression[]): Expression {
  if (expressions.length === 0) {
    throw new InvalidPredicateError(
      `${kind}() needs at least one expression. An empty ${kind === "and" ? "conjunction" : "disjunction"} ` +
        `has no query-language spelling — leave the ${kind}() out, or omit the filter entirely to match everything.`,
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
function renderLiteral(value: ArkivValue): string {
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
