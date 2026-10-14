import {
  type AnyColumn,
  type ArkivValue,
  type ColumnsOf,
  describeColumns,
  lookupColumn,
  SCHEMA_ATTRIBUTE,
  type Schema,
  SchemaMismatchError,
  type StrValue,
  SYSTEM_FIELDS,
  type SystemField,
  type TypeTag,
  type ValueOf,
  validateAttributeName,
} from "../schema"
import type { Entity } from "../types/entity"
import type { RpcSelect } from "../types/rpcSchema"

/**
 * The entity fields a query run without a schema can select. Each maps one-to-one onto a field of
 * {@link Entity}.
 *
 * `attributes` takes a third form beyond `true`/`false`: a map of names, to fetch only those.
 */
export type SelectionFields = { [K in SystemField]?: boolean } & {
  /** Attribute names, types and indexing, without their values. */
  attributeSchema?: boolean
  /** `true` for every attribute, or a map of names for a subset. */
  attributes?: boolean | Readonly<Record<string, boolean>>
}

/** The selection keys, in the order they are written into the RPC `select` object. */
const SELECTION_KEYS = [
  ...SYSTEM_FIELDS,
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
 * A non-empty entity selection — the object form accepted by `select()` for a query run without a
 * schema. At least one field must be selected.
 */
export type EntitySelection = AtLeastOne<SelectionFields>

/** Argument accepted by `select()` — a non-empty {@link EntitySelection}, or `"*"` for everything. */
export type SelectArg = EntitySelection | "*"

/**
 * Any selection object `select()` accepts: entity fields and, for a query that goes on to name a
 * schema with `.from(...)`, column names. Which keys are valid is settled by `.from(...)` — or,
 * without one, by {@link EntitySelection}.
 */
export type Selection = Readonly<Record<string, boolean | Readonly<Record<string, boolean>>>>

/** Whether a selection value asks for the field: `true`, or a non-empty map of attribute names. */
type Selected<V> = V extends false | undefined ? false : true

/**
 * The result of a selection `S`: an {@link Entity} narrowed to exactly the selected fields (each
 * non-`undefined`). The shape is flat — `select({ owner: true })` yields `{ owner: Hex }`, read as
 * `entity.owner`. Accessing an unselected field is a compile error.
 */
export type ProjectedEntity<S> = {
  readonly [K in keyof S as Selected<S[K]> extends true ? K : never]: K extends keyof Entity
    ? NonNullable<Entity[K]>
    : never
}

/** A selection of every field, used to type the result of `select()` / `select("*")`. */
type AllSelected = { [K in (typeof SELECTION_KEYS)[number]]: true }

/** The projected entity type when everything is selected — every field. */
export type FullEntity = ProjectedEntity<AllSelected>

/**
 * What a column reads back as: a value of its type, or `undefined` too if the column is optional.
 */
export type ColumnValue<C> = C extends {
  readonly type: infer T extends TypeTag
  readonly isOptional: infer O
}
  ? ValueOf<T> | (true extends O ? undefined : never)
  : never

/**
 * One result of a query run through schema `TSchema`, narrowed to selection `S`: the selected
 * entity fields and the selected columns side by side, each column typed as its schema declares.
 *
 * @example
 * // select({ key: true, title: true, score: true }).from(Posts)
 * // → { key: Hex; title: StrValue; score: DecValue }
 */
export type Row<S, TSchema extends Schema> = {
  readonly [K in keyof S as Selected<S[K]> extends true ? K : never]: K extends SystemField
    ? NonNullable<Entity[K]>
    : K extends keyof ColumnsOf<TSchema>
      ? ColumnValue<ColumnsOf<TSchema>[K]>
      : never
}

/** The row type when everything is selected — every entity field and every column. */
export type FullRow<TSchema extends Schema> = Row<
  { [K in SystemField | keyof ColumnsOf<TSchema>]: true },
  TSchema
>

declare const dynamic: unique symbol

/**
 * The selection type of a builder whose selection is only known at runtime — `select(sel)` with
 * `sel` typed {@link SelectArg} rather than written inline. Nothing about which fields will be
 * present can be known statically, so results are typed with every field optional.
 */
export type DynamicSelection = { readonly [dynamic]: true }

/**
 * A row through schema `TSchema` whose selection is only known at runtime: any entity field and
 * any column may be absent, because nothing says statically which were selected.
 */
export type PartialRow<TSchema extends Schema> = {
  readonly [K in SystemField]?: NonNullable<Entity[K]>
} & {
  readonly [K in keyof ColumnsOf<TSchema>]?: ValueOf<ColumnsOf<TSchema>[K]["type"]>
}

/** What a query returns per result: entities without a schema, rows through one. */
export type ResultOf<
  TSelection,
  TSchema extends Schema | undefined,
> = TSelection extends DynamicSelection
  ? TSchema extends Schema
    ? PartialRow<TSchema>
    : Entity
  : TSchema extends Schema
    ? TSelection extends "*"
      ? FullRow<TSchema>
      : Row<TSelection, TSchema>
    : TSelection extends "*"
      ? FullEntity
      : ProjectedEntity<TSelection>

/**
 * The keys of a selection that are neither an entity field nor a column of `TSchema` — none for a
 * star or a selection only known at runtime, which `from()` checks when it runs instead.
 */
export type UnknownSelection<TSelection, TSchema extends Schema> = TSelection extends
  | "*"
  | DynamicSelection
  ? never
  : Exclude<keyof TSelection, SystemField | keyof ColumnsOf<TSchema>>

/**
 * Converts a {@link SelectArg} into the RPC `select` object.
 *
 * Every field is opt-in — anything not explicitly selected is sent as `false`, including the key.
 * Sending the full object rather than omitting the `false`s keeps what the SDK asked for legible in
 * a request log, and pins the answer even if a node's defaults change.
 *
 * `undefined` or `"*"` selects everything.
 *
 * @throws If the selection asks for nothing, or names something that is not an entity field.
 *
 * @example
 * toRpcSelect()                    // everything
 * toRpcSelect({ key: true })       // only the key
 * toRpcSelect({ attributes: { projectId: true } })  // one named attribute
 */
export function toRpcSelect(selection?: SelectArg | Selection): RpcSelect {
  if (selection === undefined || selection === "*") {
    return Object.fromEntries(SELECTION_KEYS.map((field) => [field, true])) as RpcSelect
  }

  for (const field of Object.keys(selection)) {
    if (!(SELECTION_KEYS as readonly string[]).includes(field)) {
      throw new Error(
        `select() names "${field}", which is not an entity field. To select a column, run the ` +
          "query through its schema: select({ ... }).from(schema).",
      )
    }
  }

  const fields = selection as SelectionFields
  const select: RpcSelect = {}
  let any = false
  for (const field of SELECTION_KEYS) {
    const value = fields[field]
    if (field === "attributes" && typeof value === "object" && value !== null) {
      // A named subset. An empty map asks for no attributes at all, which is what `false` means.
      const names = Object.entries(value).filter(([, wanted]) => wanted)
      // Checked rather than forwarded: a name outside the grammar cannot exist on any entity, so
      // asking for one is a typo that would otherwise come back as a silently absent attribute.
      for (const [name] of names) validateAttributeName(name)
      select.attributes = names.length > 0 ? Object.fromEntries(names) : false
      any ||= names.length > 0
      continue
    }
    select[field] = value === true
    any ||= value === true
  }

  // Rejects both `{}` and a selection whose fields are all explicitly `false` — the type system
  // permits `select({ key: false })`, and the node would answer it with a page of empty objects.
  if (!any) throw nothingSelected()
  return select
}

/**
 * A selection resolved against a schema: what to ask the node for, and how to lay the answer out.
 */
export type SchemaProjection = {
  readonly select: RpcSelect
  /** The entity fields each row carries. */
  readonly fields: readonly SystemField[]
  /** The columns each row carries, by name. */
  readonly columns: readonly (readonly [name: string, column: AnyColumn])[]
  /** The tag each entity must carry, for a named schema. Checked, never part of the row. */
  readonly tag: StrValue | undefined
}

/**
 * Resolves a selection of entity fields and columns against a schema. `undefined` or `"*"` selects
 * every entity field and every column.
 *
 * Columns are fetched by name, so attributes an entity carries beyond its schema stay on the node.
 * A named schema's tag is fetched too, so each entity can be checked against it.
 *
 * @throws If the selection asks for nothing, or names something that is neither an entity field
 * nor a column of the schema.
 */
export function projectSchema(
  selection: Selection | "*" | undefined,
  schema: Schema,
): SchemaProjection {
  const everything = selection === undefined || selection === "*"
  const fields: SystemField[] = []
  const columns: [string, AnyColumn][] = []

  if (everything) {
    fields.push(...SYSTEM_FIELDS)
    columns.push(...Object.entries(schema.columns))
  } else {
    for (const [name, wanted] of Object.entries(selection)) {
      const isField = (SYSTEM_FIELDS as readonly string[]).includes(name)
      const column = lookupColumn(schema, name)
      if (!isField && column === undefined) {
        throw new Error(
          `select() names "${name}", which is neither an entity field nor a column of the ` +
            `schema. Its columns are ${describeColumns(schema)}.`,
        )
      }
      if (typeof wanted !== "boolean") {
        throw new Error(`select() takes true or false for "${name}", got ${typeof wanted}.`)
      }
      if (!wanted) continue
      if (column === undefined) fields.push(name as SystemField)
      else columns.push([name, column])
    }
    if (fields.length === 0 && columns.length === 0) throw nothingSelected()
  }

  const attributes = columns.map(([name]) => name)
  if (schema.tag !== undefined) attributes.push(SCHEMA_ATTRIBUTE)

  const select: RpcSelect = {}
  for (const field of SELECTION_KEYS) select[field] = fields.includes(field as SystemField)
  select.attributes =
    attributes.length > 0 ? Object.fromEntries(attributes.map((name) => [name, true])) : false
  return { select, fields, columns, tag: schema.tag }
}

/**
 * Lays an entity out as a row of `projection`, checking it against the schema.
 *
 * @throws {SchemaMismatchError} If a named schema's entity is not tagged with its name, or the
 * entity lacks a required column or holds one with a type other than the schema's — it was not
 * written through this schema, or was patched since.
 */
export function toRow(entity: Entity, projection: SchemaProjection): Record<string, unknown> {
  const subject = entity.key === undefined ? "the entity" : `entity ${entity.key}`

  const { tag } = projection
  if (tag !== undefined) {
    const found = entity.attributes?.[SCHEMA_ATTRIBUTE]
    if (found?.type !== "str" || found.value !== tag.value) {
      throw new SchemaMismatchError(
        SCHEMA_ATTRIBUTE,
        `${subject} is ${found === undefined ? "not tagged with a schema" : `tagged ${JSON.stringify(found.value)}`}, ` +
          `not ${JSON.stringify(tag.value)}, so it was not written through this schema`,
      )
    }
  }

  const row: Record<string, unknown> = {}
  for (const field of projection.fields) row[field] = entity[field]

  for (const [name, column] of projection.columns) {
    const value: ArkivValue | undefined = entity.attributes?.[name]
    if (value === undefined) {
      if (!column.isOptional) {
        throw new SchemaMismatchError(
          name,
          `${subject} has no value for this required ${column.type} column, so it does not ` +
            "match the schema. Declare the column .optional() if entities may leave it unset",
        )
      }
    } else if (value.type !== column.type) {
      throw new SchemaMismatchError(
        name,
        `${subject} holds a ${value.type}, not the ${column.type} the schema declares`,
      )
    }
    row[name] = value
  }
  return row
}

function nothingSelected(): Error {
  return new Error(
    'select() requires at least one field to be selected. Pass select() or select("*") to select everything.',
  )
}
