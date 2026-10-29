import type { TypeTag } from "../schema"

/**
 * A predicate asked for an operator the query language does not define for that type.
 *
 * The operator × type matrix is part of the language, not a policy: a prefix test on a type other
 * than `str` is a **type error** at the node (a {@link QueryError} of kind `"type"`), not
 * an empty result. Catching it here turns a round trip and an RPC error code into a stack trace
 * pointing at the call site.
 *
 * | | `=` `<` `<=` `>` `>=` `BETWEEN` | `STARTSWITH` |
 * | --- | --- | --- |
 * | `str` | yes | yes |
 * | every other indexable type | yes | no |
 */
export class UnsupportedOperatorError extends Error {
  /** The attribute the predicate names. */
  readonly attributeName: string
  /** The operator, as it would have been written in the query. */
  readonly operator: string
  /** The type of the value it was applied to. */
  readonly tag: TypeTag

  constructor(attributeName: string, operator: string, tag: TypeTag, hint?: string) {
    super(
      `The query language does not define ${operator} for a ${tag}, so "${attributeName} ` +
        `${operator} ..." cannot be expressed.${hint ? ` ${hint}` : ""}`,
    )
    this.name = "UnsupportedOperatorError"
    this.attributeName = attributeName
    this.operator = operator
    this.tag = tag
  }
}

/**
 * A predicate or query could not be expressed in the query language for a reason other than its
 * operator. The main causes:
 *
 * - a `$` name that is not a queryable system attribute — one returned in results but never
 *   indexed (`$createdAt`, `$updatedAt`, `$creationFlags`), or none at all;
 * - a system attribute compared against the wrong type, or tested with `exists()` / `hasType()`,
 *   which on a system attribute would be constants;
 * - a comparison against a `bytes` value, which is never indexed;
 * - a `BETWEEN` whose bounds have different types;
 * - a `hasType()` tag that is not an indexable type;
 * - a combinator with nothing to combine;
 * - a query with no filter at all — a named schema's tag counts as one;
 * - through `.from(schema)`, a filter that does not fit the schema: a name that is not a column, a
 *   column that is not indexed, or a value of another type than the column's;
 * - a sort key that cannot be sent: an `orderBy()` with no key or more than one, a key on a bytes
 *   column or on something that is not a column of the schema, one with no type and no schema to
 *   take it from, or one whose type is not the attribute's.
 */
export class InvalidPredicateError extends Error {
  /** The attribute the predicate names, where there is one. */
  readonly attributeName: string | undefined

  constructor(message: string, attributeName?: string) {
    super(message)
    this.name = "InvalidPredicateError"
    this.attributeName = attributeName
  }
}

/**
 * What a node rejected a query for. Part of the frozen RPC surface, so it is safe to branch on —
 * a `"cursor"` failure means start the query again, and the rest mean the query itself needs
 * fixing.
 */
export type QueryErrorKind =
  /** The query string does not parse. `data` locates it: `{ position, expected, got }`. */
  | "parse"
  /** A predicate is well-formed but ill-typed — `STARTSWITH` on a type other than `str`, `BETWEEN` bounds of different types, an unknown tag. */
  | "type"
  /** A literal failed validation — an `i32` out of range, a bad EIP-55 checksum, more than 18 decimal places. */
  | "literal"
  /** A node budget was exceeded — query length, predicate count, nesting depth, bitmap operations. */
  | "limits"
  /** The cursor expired, is malformed, or belongs to a different query, block or selection. */
  | "cursor"

/** The JSON-RPC error codes `arkiv_query` answers with, and what each one means. */
const QUERY_ERROR_KINDS: Readonly<Record<number, QueryErrorKind>> = {
  [-32001]: "parse",
  [-32002]: "type",
  [-32003]: "literal",
  [-32004]: "limits",
  [-32005]: "cursor",
}

/**
 * The node rejected a query.
 *
 * These codes are part of the frozen `arkiv_query` surface, so {@link kind} and {@link data} are
 * stable enough to branch on — which the underlying JSON-RPC error is not, because the codes
 * overlap Ethereum's own EIP-1474 numbering and get wrapped accordingly on the way up.
 *
 * @example
 * try {
 *   await result.next()
 * } catch (error) {
 *   if (error instanceof QueryError && error.kind === "cursor") {
 *     // The page is gone — start the query over.
 *   }
 * }
 */
export class QueryError extends Error {
  /** Which failure this is. */
  readonly kind: QueryErrorKind
  /** The JSON-RPC error code. */
  readonly code: number
  /** The machine-readable detail the node sent, if any — e.g. `{ position, expected, got }`. */
  readonly data: unknown
  /** The query string that was rejected. */
  readonly query: string

  constructor(kind: QueryErrorKind, code: number, query: string, data: unknown, detail?: string) {
    super(`Query rejected (${kind}, ${code})${detail ? `: ${detail}` : ""}. Query: ${query}`, {
      cause: data,
    })
    this.name = "QueryError"
    this.kind = kind
    this.code = code
    this.data = data
    this.query = query
  }
}

/**
 * Recognises an `arkiv_query` failure in whatever the transport threw.
 *
 * The codes are dug out of the error chain rather than read off the top: viem maps this range onto
 * its own EIP-1474 error classes (`-32001` is its "resource not found"), so by the time an error
 * surfaces the Arkiv meaning is one or more `cause` links down.
 *
 * @returns The typed error, or `undefined` if this was not a query rejection.
 */
export function asQueryError(error: unknown, query: string): QueryError | undefined {
  let code: number | undefined
  let data: unknown
  let detail: string | undefined

  let current: unknown = error
  for (let depth = 0; current != null && depth < 8; depth++) {
    const link = current as {
      code?: unknown
      data?: unknown
      details?: unknown
      cause?: unknown
    }
    if (code === undefined && typeof link.code === "number") code = link.code
    if (data === undefined && link.data !== undefined) data = link.data
    // viem keeps the node's own message as `details`. Its `shortMessage` is the EIP-1474 label for
    // the code ("Requested resource not found." for -32001), which says nothing about the query.
    if (detail === undefined && typeof link.details === "string" && link.details !== "") {
      detail = link.details
    }
    current = link.cause
  }
  if (detail === undefined) {
    const message = (data as { message?: unknown } | undefined)?.message
    if (typeof message === "string" && message !== "") detail = message
  }

  const kind = code === undefined ? undefined : QUERY_ERROR_KINDS[code]
  if (kind === undefined || code === undefined) return undefined
  return new QueryError(kind, code, query, data, detail)
}
