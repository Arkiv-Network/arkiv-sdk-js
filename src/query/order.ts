import type { ColumnsOf, IndexableTypeTag, Schema } from "../schema"
import { InvalidPredicateError } from "./errors"
import {
  type AttributeRef,
  INDEXABLE_TAGS,
  isIndexableTag,
  type Refs,
  type RefsOf,
  resolveReference,
  type SystemAttributeRef,
  sortableColumn,
} from "./expression"

/** Which way a sort runs. */
export type SortDirection = "asc" | "desc"

/**
 * A sort: the attribute, the type it is read as, and the direction. Built by {@link asc} and
 * {@link desc}, and passed to `select(...).orderBy(...)` or `query(..., { orderBy })`.
 *
 * The node sorts the attribute as one type, so every key carries a type. A system attribute's is
 * fixed, and through a schema it comes from the column; otherwise the caller writes it.
 *
 * @typeParam R - The attribute the key names, as an {@link AttributeRef} — checked against the
 * schema by `select(...).from(schema).orderBy(...)`, as `where` checks filters.
 */
export interface OrderTerm<R extends AttributeRef = AttributeRef> extends Refs<R> {
  readonly kind: "order"
  readonly name: string
  /** The type sorted on, or `undefined` until the schema the query reads through supplies it. */
  readonly type: IndexableTypeTag | undefined
  readonly direction: SortDirection
}

/**
 * The reference a key on `N` makes — with the type written, or a system attribute's fixed one. One
 * per name when `N` is a union, so each name keeps its own type; a name typed as plain `string`
 * could be anything, so it has no fixed type to claim.
 */
type OrderRef<N extends string, T extends IndexableTypeTag> = N extends string
  ? {
      readonly name: N
      readonly type: [T] extends [never]
        ? string extends N
          ? never
          : Extract<SystemAttributeRef, { readonly name: N }>["type"]
        : T
    }
  : never

/** Whether a value is a key built by {@link asc} or {@link desc}. */
export function isOrderTerm(value: unknown): value is OrderTerm {
  return typeof value === "object" && value !== null && (value as OrderTerm).kind === "order"
}

/**
 * Checks a key that did not come from {@link asc} or {@link desc} — parsed from a request, say —
 * as they check theirs, and returns it as they would have built it.
 *
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the value is not a key, its direction is not `"asc"` or
 * `"desc"`, or its name or type is one `asc` and `desc` reject.
 */
export function checkedOrderTerm(value: unknown): OrderTerm {
  if (!isOrderTerm(value)) {
    throw new InvalidPredicateError("A sort key is an asc(...) or a desc(...).")
  }
  const { name, type, direction } = value
  return orderTerm(name, type, direction)
}

function orderTerm<R extends AttributeRef>(
  name: string,
  type: string | undefined,
  direction: SortDirection,
): OrderTerm<R> {
  // No queryable system attribute is a bytes, so every one of them is sortable.
  const system = resolveReference(name, "sort") as IndexableTypeTag | undefined
  if (direction !== "asc" && direction !== "desc") {
    throw new InvalidPredicateError(
      `A sort runs "asc" or "desc", not ${JSON.stringify(direction)}.`,
      name,
    )
  }
  if (type !== undefined && (typeof type !== "string" || !isIndexableTag(type))) {
    throw new InvalidPredicateError(
      `"${name}" cannot be sorted as "${type}": a sort reads one of ${INDEXABLE_TAGS}.`,
      name,
    )
  }
  if (system !== undefined && type !== undefined && type !== system) {
    throw new InvalidPredicateError(
      `"${name}" is always a ${system}, so it cannot be sorted as a ${type}. Leave the type out — ` +
        "a system attribute's is fixed.",
      name,
    )
  }
  return Object.freeze({ kind: "order", name, type: type ?? system, direction })
}

/**
 * Sorts by an attribute, smallest first, in the order values compare in — see
 * `ComparisonOperator`. Entities where the attribute is unset, or set with another type, come
 * first.
 *
 * @param name - An attribute of any type but bytes, indexed or not, or one of the system
 * attributes `$key`, `$owner`, `$creator` and `$expiresAt`.
 * @param type - The type to sort the attribute as. A system attribute's is fixed, and through a
 * schema it is the column's, so it is needed only for a query without one.
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, the type is bytes or not a type, or a system attribute is given another type.
 *
 * @example
 * asc("title")              // through a schema: title:str ASC
 * asc("score", "u256")      // without one: score:u256 ASC
 * asc("$expiresAt")         // $expiresAt:u64 ASC
 */
export function asc<N extends string>(name: N): OrderTerm<OrderRef<N, never>>
export function asc<N extends string, T extends IndexableTypeTag>(
  name: N,
  type: T,
): OrderTerm<OrderRef<N, T>>
export function asc(name: string, type?: IndexableTypeTag): OrderTerm {
  // Overloaded rather than one signature with an optional type, so that a key without a type has no
  // type parameter to infer: inside an array, the contextual return type would widen it.
  return orderTerm(name, type, "asc")
}

/**
 * Sorts by an attribute, largest first, in the order values compare in — see
 * `ComparisonOperator`. Entities where the attribute is unset, or set with another type, come
 * last.
 *
 * @param name - An attribute of any type but bytes, indexed or not, or one of the system
 * attributes `$key`, `$owner`, `$creator` and `$expiresAt`.
 * @param type - The type to sort the attribute as. A system attribute's is fixed, and through a
 * schema it is the column's, so it is needed only for a query without one.
 * @throws {InvalidAttributeNameError} If the name is outside the attribute name grammar.
 * @throws {InvalidPredicateError} If the name starts with `$` but is not a queryable system
 * attribute, the type is bytes or not a type, or a system attribute is given another type.
 *
 * @example
 * desc("score")             // through a schema: score:dec DESC
 * desc("score", "u256")     // without one: score:u256 DESC
 */
export function desc<N extends string>(name: N): OrderTerm<OrderRef<N, never>>
export function desc<N extends string, T extends IndexableTypeTag>(
  name: N,
  type: T,
): OrderTerm<OrderRef<N, T>>
export function desc(name: string, type?: IndexableTypeTag): OrderTerm {
  return orderTerm(name, type, "desc")
}

/**
 * The references a sort through schema `S` may make: each column but a bytes one, indexed or not,
 * with its declared type, and the queryable system attributes with theirs.
 */
type SortRef<S extends Schema> =
  | {
      [K in keyof ColumnsOf<S> & string]: ColumnsOf<S>[K]["type"] extends IndexableTypeTag
        ? { readonly name: K; readonly type: ColumnsOf<S>[K]["type"] }
        : never
    }[keyof ColumnsOf<S> & string]
  | SystemAttributeRef

/**
 * Human-readable messages for compile-time errors when a sort key cannot be sent — it names a
 * bytes column or something that is not a column, asserts another type than its column's, or,
 * without a schema, has no type at all.
 */
type OrderProblem<R, TSchema> = R extends {
  readonly name: infer N extends string
  readonly type: infer T extends string
}
  ? N extends `$${string}`
    ? R extends SystemAttributeRef
      ? never
      : N extends SystemAttributeRef["name"]
        ? `"${N}" is always a ${Extract<SystemAttributeRef, { name: N }>["type"]}, but the sort asserts ${T}`
        : `"${N}" cannot be sorted on. The sortable system attributes are $key, $owner, $creator and $expiresAt`
    : TSchema extends Schema
      ? R extends SortRef<TSchema>
        ? never
        : N extends SortRef<TSchema>["name"]
          ? `"${N}" has type ${Extract<SortRef<TSchema>, { name: N }>["type"]}, but the sort asserts ${T}`
          : N extends keyof ColumnsOf<TSchema>
            ? `"${N}" is a bytes column, and bytes cannot be sorted on`
            : `"${N}" is not a column of this schema`
      : [T] extends [never]
        ? `"${N}" needs its type to be sorted on without a schema. Write it, as in desc("${N}", "u256")`
        : never
  : never

/**
 * `orderBy`'s check that the key can be sent — `unknown` when it can, and otherwise an object
 * whose one property is named after the problem. No key has that property, so the compiler reports
 * the sentence as the property it is missing.
 */
export type OrderCheck<K extends OrderTerm, TSchema> = [OrderProblem<RefsOf<K>, TSchema>] extends [
  infer P extends string,
]
  ? [P] extends [never]
    ? unknown
    : { [Problem in P]: never }
  : unknown

/**
 * Renders the `ORDER BY` clause the node parses, taking the key's type from the schema where the
 * key leaves it out — the runtime half of {@link OrderCheck}, for the callers the type system does
 * not reach.
 *
 * @throws {InvalidPredicateError} If the key has no type and there is no schema to give it one,
 * or — through a schema — names a bytes column or something that is not a column, or asserts
 * another type than the column's.
 */
export function renderOrderBy(term: OrderTerm, schema: Schema | undefined): string {
  return `ORDER BY ${term.name}:${resolveOrderType(term, schema)} ${term.direction.toUpperCase()}`
}

function resolveOrderType(term: OrderTerm, schema: Schema | undefined): IndexableTypeTag {
  const { name, type } = term
  if (name.startsWith("$")) {
    // asc() and desc() set a system attribute's fixed type, and check it, so only a key built some
    // other way has none.
    if (type !== undefined) return type
    throw new InvalidPredicateError(
      `The key on "${name}" has no type, though a system attribute's is fixed. Build it with ` +
        "asc() or desc(), which give it one.",
      name,
    )
  }
  if (schema === undefined) {
    if (type !== undefined) return type
    throw new InvalidPredicateError(
      `"${name}" needs its type to be sorted on: the node sorts it as one type, and without a ` +
        `schema there is no column to take it from. Write it, as in desc("${name}", "u256").`,
      name,
    )
  }

  const columnType = sortableColumn(schema, name, "sort").type
  if (type !== undefined && type !== columnType) {
    throw new InvalidPredicateError(
      `"${name}" is a ${columnType} column, but the sort asserts a ${type}. Leave the type out ` +
        "to sort it as the column's.",
      name,
    )
  }
  return columnType
}
