import {
  type AnyColumn,
  type ArkivValue,
  type AttributeSchema,
  type Attributes,
  type ColumnsOf,
  describeColumns,
  lookupColumn,
  SCHEMA_ATTRIBUTE,
  type Schema,
  SchemaMismatchError,
  type StrValue,
  type TypeTag,
  type ValueOf,
  validateAttributeName,
} from "../schema"
import type { Entity, EntityFields } from "../types/entity"
import type { RpcSelect } from "../types/rpcSchema"

/**
 * The entity fields a row can carry. Each is `$`-prefixed, like the system attributes `where`
 * filters on: an attribute name cannot start with `$`, so no attribute can collide with one.
 */
export const SYSTEM_FIELDS = [
  "$key",
  "$owner",
  "$creator",
  "$createdAt",
  "$updatedAt",
  "$expiresAt",
  "$creationFlags",
] as const

/** The name of an entity field a row carries alongside its attributes. */
export type SystemField = (typeof SYSTEM_FIELDS)[number]

/** The {@link Entity} property a system field reads. */
type EntityField<F extends SystemField> = F extends `$${infer N extends keyof EntityFields}`
  ? N
  : never

/**
 * The keys a selection gives a fixed meaning: the entity fields, plus `$attributes` and
 * `$attributeSchema`, which read an entity's attributes as a whole. Any key without a `$` names an
 * attribute.
 */
export type SelectionFields = { [K in SystemField]?: boolean } & {
  /** Attribute names, types and indexing, without their values. */
  $attributeSchema?: boolean
  /** Every attribute, as a map keyed by name. */
  $attributes?: boolean
}

/** The selection keys with a fixed meaning, in the order they are written into the RPC `select`. */
const SELECTION_KEYS = [
  ...SYSTEM_FIELDS,
  "$attributeSchema",
  "$attributes",
] as const satisfies readonly (keyof SelectionFields)[]

/** A selection key with a fixed meaning. */
type SelectionKey = (typeof SELECTION_KEYS)[number]

/**
 * A selection: entity fields, `$attributes` / `$attributeSchema`, and attributes by name, each set
 * to `true` to ask for it. The same selection means the same thing with or without a schema —
 * naming one with `.from(...)` only types and checks the selected attributes, and the filter. A
 * named schema also restricts the query to entities tagged with its name, and leaves the tag out of
 * every row.
 */
export type Selection = Readonly<Record<string, boolean | undefined>>

/** Argument accepted by `select()` — a {@link Selection}, or `"*"` for everything. */
export type SelectArg = Selection | "*"

/** Whether a selection value asks for the field: `true` does, `false` and `undefined` do not. */
export type Selected<V> = V extends false | undefined ? false : true

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
 * What a selected key reads back as: an entity field as the entity has it, the attributes as a
 * whole, or one attribute — typed by its column through a schema, and any value or none without.
 */
type FieldValue<K, TSchema extends Schema | undefined> = K extends SystemField
  ? NonNullable<Entity[EntityField<K>]>
  : K extends "$attributes"
    ? Attributes
    : K extends "$attributeSchema"
      ? AttributeSchema
      : K extends `$${string}`
        ? never
        : TSchema extends Schema
          ? K extends keyof ColumnsOf<TSchema>
            ? ColumnValue<ColumnsOf<TSchema>[K]>
            : never
          : ArkivValue | undefined

/**
 * One result of selection `S`, through schema `TSchema` or without one: the selected entity fields
 * and attributes side by side, flat. Through a schema each attribute is typed as its column
 * declares; without one it is whatever value the entity holds, or `undefined`. Accessing an
 * unselected field is a compile error.
 *
 * @example
 * // select({ $key: true, title: true })               → { $key: Hex; title: ArkivValue | undefined }
 * // select({ $key: true, title: true }).from(Posts)   → { $key: Hex; title: StrValue }
 */
export type Row<S, TSchema extends Schema | undefined = undefined> = {
  readonly [K in keyof S as Selected<S[K]> extends true ? K : never]: FieldValue<K, TSchema>
}

/** A selection of every key with a fixed meaning, used to type `select()` / `select("*")`. */
type AllSelected = { [K in (typeof SELECTION_KEYS)[number]]: true }

/** The result when everything is selected without a schema — every field, and every attribute. */
export type FullEntity = Row<AllSelected>

/** The row type when everything is selected through a schema — every entity field and column. */
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
 * A result whose selection is only known at runtime: any entity field and any attribute may be
 * absent, because nothing says statically which were selected.
 */
export type PartialRow<TSchema extends Schema | undefined = undefined> = {
  readonly [K in SystemField]?: NonNullable<Entity[EntityField<K>]>
} & {
  readonly $attributes?: Attributes
  readonly $attributeSchema?: AttributeSchema
} & (TSchema extends Schema
    ? { readonly [K in keyof ColumnsOf<TSchema>]?: ValueOf<ColumnsOf<TSchema>[K]["type"]> }
    : { readonly [name: string]: ArkivValue | undefined })

/**
 * Whether which fields `S` selects is only known at runtime: a selection typed {@link SelectArg} or
 * {@link Selection}, or one with a field typed `boolean` rather than `true` or `false`.
 */
type IsDynamic<S> = string extends keyof Exclude<S, "*">
  ? true
  : S extends "*"
    ? false
    : true extends {
          [K in keyof S]: [S[K]] extends [boolean] ? (boolean extends S[K] ? true : false) : false
        }[keyof S]
      ? true
      : false

/**
 * The selection type a query carries for the selection `select()` or `query()` was given: `"*"`
 * for everything, {@link DynamicSelection} when the fields are only known at runtime, and the
 * selection itself otherwise.
 */
export type SelectionOf<S> = [S] extends ["*"]
  ? "*"
  : IsDynamic<S> extends true
    ? DynamicSelection
    : S

/**
 * Rejects a selection that asks for nothing at compile time — `{}`, or every field `false`:
 * `unknown` when `S` asks for something, or when that is only known at runtime, and an object no
 * selection satisfies otherwise.
 */
export type NonEmptySelection<S> = SelectionOf<S> extends "*" | DynamicSelection
  ? unknown
  : [keyof { [K in keyof S as Selected<S[K]> extends true ? K : never]: true }] extends [never]
    ? { "select() needs at least one field set to true": true }
    : unknown

/**
 * Rejects a `$` key that is not an entity field, `$attributes` or `$attributeSchema` at compile
 * time. An attribute name cannot start with `$`, so such a key can only be a typo: `unknown` when
 * there is none, and an object naming the offenders, which no selection satisfies, otherwise.
 */
export type KnownSystemFields<S> = SelectionOf<S> extends "*" | DynamicSelection
  ? unknown
  : [Extract<Exclude<keyof S, SelectionKey>, `$${string}`>] extends [never]
    ? unknown
    : {
        "selected names that are not entity fields": Extract<
          Exclude<keyof S, SelectionKey>,
          `$${string}`
        >
      }

/** What a query returns per result — a flat row, typed by the schema when there is one. */
export type ResultOf<
  TSelection,
  TSchema extends Schema | undefined,
> = TSelection extends DynamicSelection
  ? PartialRow<TSchema>
  : TSelection extends "*"
    ? TSchema extends Schema
      ? FullRow<TSchema>
      : FullEntity
    : Row<TSelection, TSchema>

/**
 * The keys of a selection that mean nothing through `TSchema` — neither an entity field,
 * `$attributes` / `$attributeSchema`, nor a column. None for a star or a selection only known at
 * runtime, which `from()` checks when it runs instead.
 */
export type UnknownSelection<TSelection, TSchema extends Schema> = TSelection extends
  | "*"
  | DynamicSelection
  ? never
  : Exclude<keyof TSelection, SelectionKey | keyof ColumnsOf<TSchema>>

/**
 * Converts a selection into the RPC `select` object — the same request {@link projectSelection}
 * makes without a schema.
 *
 * Every field is opt-in — anything not explicitly selected is sent as `false`, including the key.
 * Sending the full object rather than omitting the `false`s keeps what the SDK asked for legible in
 * a request log, and pins the answer even if a node's defaults change.
 *
 * `undefined` or `"*"` selects everything.
 *
 * @throws If the selection asks for nothing, or names an attribute outside the name grammar.
 *
 * @example
 * toRpcSelect()                                     // everything
 * toRpcSelect({ $key: true })                       // only the key
 * toRpcSelect({ $key: true, projectId: true })      // the key and one attribute
 */
export function toRpcSelect(selection?: SelectArg): RpcSelect {
  return projectSelection(selection).select
}

/**
 * A frozen copy of a selection, so that editing the object passed to `select()` afterwards cannot
 * change what the builder sends.
 */
export function snapshotSelection<S extends SelectArg | undefined>(selection: S): S {
  if (typeof selection !== "object" || selection === null) return selection
  return Object.freeze({ ...selection }) as S
}

/**
 * A selection resolved, through a schema or without one: what to ask the node for, and how to lay
 * the answer out.
 */
export type Projection = {
  readonly select: RpcSelect
  /** The entity fields each row carries. */
  readonly fields: readonly SystemField[]
  /**
   * The attributes each row carries as fields of their own, by name — each with its column
   * through a schema, which the value is checked against, and `undefined` without one.
   */
  readonly columns: readonly (readonly [name: string, column: AnyColumn | undefined])[]
  /** Whether each row carries the `$attributes` map. */
  readonly attributes: boolean
  /** Whether each row carries the `$attributeSchema`. */
  readonly attributeSchema: boolean
  /** The tag each entity must carry, for a named schema. Checked, never part of the row. */
  readonly tag: StrValue | undefined
}

/**
 * Resolves a selection, through a schema or without one. A key that does not start with `$` names
 * an attribute — through a schema, it must be a column.
 *
 * `undefined` or `"*"` selects every entity field and, through a schema, every column; without one,
 * every attribute as the `$attributes` map, and the `$attributeSchema`.
 *
 * Attributes are fetched by name where possible, so the ones a row does not carry stay on the node.
 * A named schema's tag is fetched too, so each entity can be checked against it.
 *
 * @throws If the selection asks for nothing, names a `$` key that is not an entity field, names an
 * attribute outside the name grammar, or — through a schema — names an attribute that is not a
 * column.
 */
export function projectSelection(selection?: SelectArg, schema?: Schema): Projection {
  const fields: SystemField[] = []
  const columns: [string, AnyColumn | undefined][] = []
  let attributes = false
  let attributeSchema = false

  if (selection === undefined || selection === "*") {
    fields.push(...SYSTEM_FIELDS)
    if (schema === undefined) {
      attributes = true
      attributeSchema = true
    } else {
      columns.push(...Object.entries(schema.columns))
    }
  } else {
    if (typeof selection !== "object" || selection === null || Array.isArray(selection)) {
      throw new TypeError('select() takes "*" or an object of fields set to true')
    }
    for (const [name, wanted] of Object.entries(selection)) {
      if (typeof wanted !== "boolean" && wanted !== undefined) {
        throw new Error(
          name === "$attributes"
            ? 'select() takes true or false for "$attributes", which reads every attribute. To ' +
                "read some of them, select each by name: select({ title: true, body: true })."
            : `select() takes true or false for "${name}", got ${typeof wanted}.`,
        )
      }
      const fixed = (SELECTION_KEYS as readonly string[]).includes(name)
      if (!fixed && name.startsWith("$")) {
        throw new Error(
          `select() names "${name}", which is not an entity field. The entity fields are ` +
            `${SYSTEM_FIELDS.join(", ")}, and $attributes and $attributeSchema read the ` +
            "attributes as a whole.",
        )
      }
      const column = fixed || schema === undefined ? undefined : lookupColumn(schema, name)
      if (!fixed) {
        if (schema !== undefined && column === undefined) {
          throw new Error(
            `select() names "${name}", which is not a column of the schema. Its columns are ` +
              `${describeColumns(schema)}.`,
          )
        }
        validateAttributeName(name)
      }
      if (!wanted) continue
      if (name === "$attributes") attributes = true
      else if (name === "$attributeSchema") attributeSchema = true
      else if (fixed) fields.push(name as SystemField)
      else columns.push([name, column])
    }
    // Rejects both `{}` and a selection whose fields are all explicitly `false` — the type system
    // permits `select({ $key: false })`, and the node would answer it with a page of empty objects.
    if (fields.length === 0 && columns.length === 0 && !attributes && !attributeSchema) {
      throw nothingSelected()
    }
  }

  const select: RpcSelect = {}
  for (const field of SYSTEM_FIELDS) select[entityField(field)] = fields.includes(field)
  select.attributeSchema = attributeSchema
  if (attributes) {
    select.attributes = true
  } else {
    const names = new Set(columns.map(([name]) => name))
    if (schema?.tag !== undefined) names.add(SCHEMA_ATTRIBUTE)
    select.attributes =
      names.size > 0 ? Object.fromEntries([...names].map((n) => [n, true])) : false
  }
  return { select, fields, columns, attributes, attributeSchema, tag: schema?.tag }
}

/**
 * Lays an entity out as a row of `projection` — checking it against the schema, when there is one.
 *
 * @throws {SchemaMismatchError} If a named schema's entity is not tagged with its name, or the
 * entity lacks a selected required column or holds one with a type other than the schema's — it
 * was not written through this schema, or was patched since.
 */
export function toRow(entity: Entity, projection: Projection): Record<string, unknown> {
  const subject = entity.key === undefined ? "the entity" : `entity ${entity.key}`

  const { tag } = projection
  if (tag !== undefined) {
    const found = attributeOf(entity, SCHEMA_ATTRIBUTE)
    if (found?.type !== "str" || found.value !== tag.value) {
      throw new SchemaMismatchError(
        SCHEMA_ATTRIBUTE,
        `${subject} is ${describeTag(found)}, not ${JSON.stringify(tag.value)}, so it was not ` +
          "written through this schema",
      )
    }
  }

  const row: Record<string, unknown> = {}
  for (const field of projection.fields) row[field] = entity[entityField(field)]

  for (const [name, column] of projection.columns) {
    const value = attributeOf(entity, name)
    if (column !== undefined) {
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
    }
    row[name] = value
  }

  if (projection.attributes) {
    row.$attributes = withoutTag(entity.attributes ?? {}, tag)
  }
  if (projection.attributeSchema) {
    row.$attributeSchema = withoutTag(entity.attributeSchema ?? {}, tag)
  }
  return row
}

/** The {@link Entity} property, and RPC `select` key, a system field reads: its name without `$`. */
function entityField<F extends SystemField>(field: F): EntityField<F> {
  return field.slice(1) as EntityField<F>
}

/**
 * A copy of `record` without a named schema's tag: the tag is how a query finds the schema's
 * entities, not one of their attributes, so a row never carries it — and a map read back from a
 * row drops into a write without sending the reserved name.
 */
function withoutTag<T>(record: Readonly<Record<string, T>>, tag: StrValue | undefined) {
  if (tag === undefined || !Object.hasOwn(record, SCHEMA_ATTRIBUTE)) return record
  const { [SCHEMA_ATTRIBUTE]: _tag, ...rest } = record
  return rest
}

/**
 * The entity's attribute `name`, or `undefined` if it has none. An own-property read: a column may
 * be named `constructor` or `toString`, and an entity that leaves it unset must not find the
 * inherited one instead.
 */
function attributeOf(entity: Entity, name: string): ArkivValue | undefined {
  const { attributes } = entity
  return attributes !== undefined && Object.hasOwn(attributes, name) ? attributes[name] : undefined
}

/** How an entity's schema tag reads in a mismatch — whatever type another writer gave it. */
function describeTag(found: ArkivValue | undefined): string {
  if (found === undefined) return "not tagged with a schema"
  if (found.type === "str") return `tagged ${JSON.stringify(found.value)}`
  return `tagged with a value of type ${found.type}`
}

function nothingSelected(): Error {
  return new Error(
    'select() requires at least one field to be selected. Pass select() or select("*") to select everything.',
  )
}
