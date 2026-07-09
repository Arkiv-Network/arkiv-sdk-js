import type { Entity } from "../types/entity"
import type { RpcIncludeData } from "../types/rpcSchema"

/** The entity fields that can be selected. These match the fields of {@link Entity} one-to-one. */
type DataKey =
  | "key"
  | "contentType"
  | "owner"
  | "creator"
  | "expiresAtBlock"
  | "createdAtBlock"
  | "lastModifiedAtBlock"
  | "transactionIndexInBlock"
  | "operationIndexInTransaction"
  | "attributes"
  | "payload"

/**
 * The parts of an entity that can be selected. Every field is opt-in (including the `key`) and maps
 * directly to a field of the returned {@link Entity} — the selection is flat.
 */
export type SelectionFields = { [K in DataKey]?: boolean }

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

/**
 * The result of a selection `S`: an {@link Entity} narrowed to exactly the selected fields (each
 * non-`undefined`). The shape is flat and backwards compatible — e.g. `select({ owner: true })`
 * yields `{ owner: Hex }` accessed as `entity.owner`. Accessing an unselected field is a compile
 * error.
 *
 * The `toText()` / `toJson()` helpers operate on the payload, so they are only present when
 * `payload` was selected — calling them otherwise would always throw.
 */
export type ProjectedEntity<S> = {
  readonly [K in keyof S as S[K] extends true ? K : never]: K extends keyof Entity
    ? NonNullable<Entity[K]>
    : never
} & (S extends { payload: true } ? Pick<Entity, "toText" | "toJson"> : unknown)

/** A selection of every field, used to type the result of `select()` / `select("*")`. */
type AllSelected = { [K in DataKey]: true }

/** The projected entity type when everything is selected — every field, plus the methods. */
export type FullEntity = ProjectedEntity<AllSelected>

/**
 * Converts a {@link SelectArg} into the {@link RpcIncludeData} understood by the query engine.
 * Every field is opt-in — anything not explicitly selected defaults to `false`, including the key.
 * `undefined` or `"*"` selects everything.
 *
 * @param selection - The selection to convert
 * @returns The fully-resolved include-data object for the RPC query
 * @throws If an empty selection object is provided
 *
 * @example
 * selectionToIncludeData() // everything
 * selectionToIncludeData("*") // everything
 * selectionToIncludeData({ key: true }) // only the key
 * selectionToIncludeData({ owner: true }) // only the owner
 */
export function selectionToIncludeData(selection?: SelectArg): RpcIncludeData {
  if (selection === undefined || selection === "*") {
    return {
      key: true,
      attributes: true,
      payload: true,
      contentType: true,
      expiration: true,
      owner: true,
      creator: true,
      createdAtBlock: true,
      lastModifiedAtBlock: true,
      transactionIndexInBlock: true,
      operationIndexInTransaction: true,
    }
  }

  // At least one field must be opted in. This rejects both `{}` and selections whose fields are
  // all explicitly `false` (e.g. `select({ key: false })`), which the type system permits.
  if (!Object.values(selection).some((selected) => selected === true)) {
    throw new Error(
      'select() requires at least one field to be selected. Pass select() or select("*") to select everything.',
    )
  }

  return {
    key: selection.key ?? false,
    attributes: selection.attributes ?? false,
    payload: selection.payload ?? false,
    contentType: selection.contentType ?? false,
    // The selection uses the entity field name `expiresAtBlock`; the RPC calls it `expiration`.
    expiration: selection.expiresAtBlock ?? false,
    owner: selection.owner ?? false,
    creator: selection.creator ?? false,
    createdAtBlock: selection.createdAtBlock ?? false,
    lastModifiedAtBlock: selection.lastModifiedAtBlock ?? false,
    transactionIndexInBlock: selection.transactionIndexInBlock ?? false,
    operationIndexInTransaction: selection.operationIndexInTransaction ?? false,
  }
}
