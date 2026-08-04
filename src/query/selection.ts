import type { Entity } from "../types/entity"
import type { RpcSelect } from "../types/rpcSchema"

/**
 * The entity fields a query can select. Each maps one-to-one onto a field of {@link Entity}.
 *
 * `attributes` takes a third form beyond `true`/`false`: a map of names, to fetch only those.
 */
export type SelectionFields = {
  key?: boolean
  owner?: boolean
  creator?: boolean
  createdAt?: boolean
  updatedAt?: boolean
  expiresAt?: boolean
  creationFlags?: boolean
  contentType?: boolean
  payload?: boolean
  /** Attribute names and types, without their values. */
  attributeSchema?: boolean
  /** `true` for every attribute, or a map of names for a subset. */
  attributes?: boolean | Readonly<Record<string, boolean>>
}

/** The selection keys, in the order they are written into the RPC `select` object. */
const SELECTION_KEYS = [
  "key",
  "owner",
  "creator",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "creationFlags",
  "contentType",
  "payload",
  "attributeSchema",
  "attributes",
] as const satisfies readonly (keyof SelectionFields)[]

/**
 * Requires at least one property of `T` to be present.
 * `{}` is not assignable, which is how `select({})` is rejected at compile time.
 */
type AtLeastOne<T, K extends keyof T = keyof T> = {
  [P in K]: Required<Pick<T, P>> & Partial<Omit<T, P>>
}[K]

/**
 * A non-empty entity selection — the object form accepted by `select()`. At least one field must be
 * selected.
 */
export type EntitySelection = AtLeastOne<SelectionFields>

/** Argument accepted by `select()` — a non-empty {@link EntitySelection}, or `"*"` for everything. */
export type SelectArg = EntitySelection | "*"

/** Whether a selection value asks for the field: `true`, or a non-empty map of attribute names. */
type Selected<V> = V extends false | undefined ? false : true

/**
 * The result of a selection `S`: an {@link Entity} narrowed to exactly the selected fields (each
 * non-`undefined`). The shape is flat — `select({ owner: true })` yields `{ owner: Hex }`, read as
 * `entity.owner`. Accessing an unselected field is a compile error.
 *
 * `toText()` / `toJson()` operate on the payload, so they appear only when `payload` was selected —
 * calling them otherwise would always throw.
 */
export type ProjectedEntity<S> = {
  readonly [K in keyof S as Selected<S[K]> extends true ? K : never]: K extends keyof Entity
    ? NonNullable<Entity[K]>
    : never
} & (S extends { payload: true } ? Pick<Entity, "toText" | "toJson"> : unknown)

/** A selection of every field, used to type the result of `select()` / `select("*")`. */
type AllSelected = { [K in (typeof SELECTION_KEYS)[number]]: true }

/** The projected entity type when everything is selected — every field, plus the methods. */
export type FullEntity = ProjectedEntity<AllSelected>

/**
 * Converts a {@link SelectArg} into the RPC `select` object.
 *
 * Every field is opt-in — anything not explicitly selected is sent as `false`, including the key.
 * Sending the full object rather than omitting the `false`s keeps what the SDK asked for legible in
 * a request log, and pins the answer even if a node's defaults change.
 *
 * `undefined` or `"*"` selects everything.
 *
 * @throws If the selection asks for nothing.
 *
 * @example
 * toRpcSelect()                    // everything
 * toRpcSelect({ key: true })       // only the key
 * toRpcSelect({ attributes: { projectId: true } })  // one named attribute
 */
export function toRpcSelect(selection?: SelectArg): RpcSelect {
  if (selection === undefined || selection === "*") {
    return Object.fromEntries(SELECTION_KEYS.map((field) => [field, true])) as RpcSelect
  }

  const select: RpcSelect = {}
  let any = false
  for (const field of SELECTION_KEYS) {
    const value = selection[field]
    if (field === "attributes" && typeof value === "object" && value !== null) {
      // A named subset. An empty map asks for no attributes at all, which is what `false` means.
      const names = Object.entries(value).filter(([, wanted]) => wanted)
      select.attributes = names.length > 0 ? Object.fromEntries(names) : false
      any ||= names.length > 0
      continue
    }
    select[field] = value === true
    any ||= value === true
  }

  // Rejects both `{}` and a selection whose fields are all explicitly `false` — the type system
  // permits `select({ key: false })`, and the node would answer it with a page of empty objects.
  if (!any) {
    throw new Error(
      'select() requires at least one field to be selected. Pass select() or select("*") to select everything.',
    )
  }
  return select
}
