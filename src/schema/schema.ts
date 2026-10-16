import { type AnyColumn, isColumn } from "./column"
import { InvalidValueError, SchemaDefinitionError, TooManyAttributesError } from "./errors"
import { validateAttributeName } from "./names"
import { type ArkivValue, isArkivValue, type StrValue, type TypeTag, type ValueOf } from "./types"
import { type BareOf, str } from "./values"

/**
 * The most attributes one entity operation may carry, and so the most columns a schema may have.
 */
export const MAX_ATTRIBUTES = 32

/**
 * The entity fields a query row carries alongside its columns. A column may not take one of these
 * names, because a row is flat: `row.owner` has to mean one thing.
 */
export const SYSTEM_FIELDS = [
  "key",
  "owner",
  "creator",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "creationFlags",
] as const

/** The name of an entity field a row carries alongside its columns. */
export type SystemField = (typeof SYSTEM_FIELDS)[number]

/**
 * The attribute a named schema tags its entities with: an indexed `str` holding the schema's name.
 * Creates write it, and `.from(schema)` filters on it, so a query through a schema only ever sees
 * entities written through it.
 */
export const SCHEMA_ATTRIBUTE = "arkiv.schema"

/**
 * Names a schema may not use for a column: the system fields a row carries, the two selection keys
 * that read an entity's attributes as a whole, and the schema tag.
 */
const RESERVED_COLUMN_NAMES: ReadonlySet<string> = new Set([
  ...SYSTEM_FIELDS,
  "attributes",
  "attributeSchema",
  SCHEMA_ATTRIBUTE,
])

/**
 * Marks a schema. A registry symbol rather than `instanceof`, so a schema defined through one copy
 * of the SDK — its CJS build, say — is still recognised by another, such as the ESM build an app
 * loaded.
 */
const SCHEMA_BRAND = Symbol.for("@arkiv-network/sdk/schema")

/** A schema's columns, keyed by attribute name. */
export type Columns = { readonly [name: string]: AnyColumn }

/**
 * A schema: the named, typed attributes an entity of one kind carries, and which of them the node
 * indexes. Built with {@link defineSchema}.
 *
 * A schema is an SDK-side convention. The node sees only attributes, each with a type and an
 * indexed flag; the schema is what types the SDK's writes and reads, and checks them at runtime.
 *
 * A named schema also tags every entity it creates with its name, in the indexed
 * {@link SCHEMA_ATTRIBUTE} attribute, so that a query through it sees only its own entities.
 *
 * @typeParam C - The columns, keyed by attribute name.
 */
export class Schema<C extends Columns = Columns> {
  /** The name entities are tagged with, or `undefined` for an untagged schema. */
  readonly name: string | undefined
  /** The columns, keyed by attribute name, in the order they were declared. */
  readonly columns: C
  /** The tag every create writes and every query filters on, if the schema is named. */
  readonly tag: StrValue | undefined

  /** Use {@link defineSchema}. */
  constructor(name: string | undefined, columns: C) {
    this.tag = name === undefined ? undefined : validateName(name)
    validateColumns(columns, name !== undefined)
    this.name = name
    this.columns = Object.freeze({ ...columns })
    Object.defineProperty(this, SCHEMA_BRAND, { value: true })
    Object.freeze(this)
  }
}

/**
 * Declares a schema: the attributes an entity carries, their types, and which of them are indexed.
 *
 * Each column is a type constructor called with no arguments — `str()`, `dec()`, `bytes()` —
 * refined with `.indexed()`, `.optional()` or `.default(...)`. Only indexed columns can be
 * filtered on; the rest are stored and selectable, and do not pay for an index.
 *
 * Give the schema a name to tag its entities: every create then also writes an indexed
 * `arkiv.schema` attribute holding the name, and `.from(schema)` filters on it — the way a
 * collection keeps one model's documents apart from another's. Without a name, a query through the
 * schema sees every entity its `where` matches, whatever wrote it.
 *
 * @param name - The name entities are tagged with — a `str`, so at most 128 bytes. Optional.
 * @param columns - The columns, keyed by attribute name.
 * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
 * @throws {SchemaDefinitionError} If the name is not a valid `str`, an entry is not a column, a
 * name is reserved, or there are more columns than an operation can carry.
 *
 * @example
 * import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
 *
 * const Posts = defineSchema("posts", {
 *   author:    addr().indexed(),
 *   category:  str().indexed(),
 *   score:     dec().indexed(),
 *   title:     str(),                          // stored, not indexed
 *   body:      bytes(),                        // a blob; bytes can never be indexed
 *   thumbnail: bytes().optional(),             // any number of bytes columns
 *   mimeType:  str().default("text/markdown"), // written on create when left out
 * })
 */
export function defineSchema<const C extends Columns>(name: string, columns: C): Schema<C>
export function defineSchema<const C extends Columns>(columns: C): Schema<C>
export function defineSchema<const C extends Columns>(
  ...args: [name: string, columns: C] | [columns: C]
): Schema<C> {
  return args.length === 2 ? new Schema(args[0], args[1]) : new Schema(undefined, args[0])
}

function validateName(name: string): StrValue {
  if (typeof name !== "string" || name.length === 0) {
    throw new SchemaDefinitionError(
      "a schema name must be a non-empty string — leave it out for an untagged schema",
    )
  }
  try {
    return str(name)
  } catch (error) {
    if (!(error instanceof InvalidValueError)) throw error
    throw new SchemaDefinitionError(`the name is not a valid str tag. ${error.message}`)
  }
}

function validateColumns(columns: Columns, tagged: boolean): void {
  if (typeof columns !== "object" || columns === null || Array.isArray(columns)) {
    throw new SchemaDefinitionError("defineSchema takes an object of columns keyed by name")
  }
  const entries = Object.entries(columns)
  // The tag is one more attribute on every create, so it counts against the same cap.
  const attributes = entries.length + (tagged ? 1 : 0)
  if (attributes > MAX_ATTRIBUTES) {
    throw new TooManyAttributesError(attributes, MAX_ATTRIBUTES)
  }
  for (const [name, column] of entries) {
    validateAttributeName(name)
    if (RESERVED_COLUMN_NAMES.has(name)) {
      throw new SchemaDefinitionError(
        `"${name}" is ${reservedFor(name)}, so a column cannot use it. Pick another name, e.g. ` +
          `"${name}Value"`,
        name,
      )
    }
    if (!isColumn(column)) throw notAColumn(name, column)
  }
}

function reservedFor(name: string): string {
  if (name === SCHEMA_ATTRIBUTE) return "the attribute a named schema tags its entities with"
  return SYSTEM_FIELDS.includes(name as SystemField)
    ? "an entity field that query rows already carry"
    : "a selection key that reads an entity's attributes as a whole"
}

/** Whether `input` is a schema built with {@link defineSchema}. */
export function isSchema(input: unknown): input is Schema {
  return typeof input === "object" && input !== null && SCHEMA_BRAND in input
}

/** The column `name` of `schema`, or `undefined` if it has none — inherited keys included. */
export function lookupColumn(schema: Schema, name: string): AnyColumn | undefined {
  return Object.hasOwn(schema.columns, name) ? schema.columns[name] : undefined
}

/** The schema's column names, for an error message that has to say what would have worked. */
export function describeColumns(schema: Schema): string {
  return Object.keys(schema.columns).join(", ") || "(none)"
}

function notAColumn(name: string, input: unknown): SchemaDefinitionError {
  if (isArkivValue(input)) {
    return new SchemaDefinitionError(
      `got a ${input.type} value where a column belongs. Did you mean ` +
        `${input.type}().default(${defaultArgument(input)})? Called with a value, ${input.type}(...) ` +
        `makes a value; called with none, ${input.type}() declares a column`,
      name,
    )
  }
  return new SchemaDefinitionError(
    "not a column. Declare it with a type constructor called with no arguments, e.g. str() or " +
      "dec().indexed()",
    name,
  )
}

/** A value spelled as the argument its constructor would take, for an error message. */
function defaultArgument(value: ArkivValue): string {
  switch (value.type) {
    case "bool":
    case "i32":
      return String(value.value)
    case "u64":
    case "u256":
      return `${value.value}n`
    default:
      return JSON.stringify(value.value)
  }
}

/** The columns of a schema. */
export type ColumnsOf<S extends Schema> = S["columns"]

/**
 * What a write accepts for a column of type `T`: a value of that type, or the bare form that
 * defaults to it — a `string` for `str`, a `Uint8Array` for `bytes`, a `number` for `i32`, a
 * `bigint` for `u256`, a `boolean` for `bool`. Every other type is written tagged.
 */
export type ColumnInput<T extends TypeTag> = ValueOf<T> | BareOf<T>

/** The columns a create must provide: neither optional nor defaulted. */
type RequiredColumnName<C extends Columns> = {
  [K in keyof C]: C[K] extends { readonly isOptional: false; readonly defaultValue: undefined }
    ? K
    : never
}[keyof C]

/** The columns an entity may leave unset — which is to say, the ones a patch may unset. */
export type OptionalColumnName<S extends Schema> = {
  [K in keyof ColumnsOf<S>]: true extends ColumnsOf<S>[K]["isOptional"] ? K : never
}[keyof ColumnsOf<S>] &
  string

/** The indexed columns, which are the only ones `where` can filter on. */
export type IndexedColumnName<S extends Schema> = {
  [K in keyof ColumnsOf<S>]: true extends ColumnsOf<S>[K]["isIndexed"] ? K : never
}[keyof ColumnsOf<S>] &
  string

/**
 * The values a create takes for schema `S`: every required column, plus any optional or
 * defaulted one. A defaulted column left out is written with its default.
 *
 * @example
 * const values: CreateEntityValues<typeof Posts> = {
 *   author: addr("0x…"),
 *   category: "docs",          // bare string -> str
 *   score: dec("4.1"),
 *   title: "Cells, not entities",
 *   body: new Uint8Array(),    // bare Uint8Array -> bytes
 * }
 */
export type CreateEntityValues<S extends Schema> = Prettify<
  {
    readonly [K in RequiredColumnName<ColumnsOf<S>>]: ColumnInput<ColumnsOf<S>[K]["type"]>
  } & {
    readonly [K in Exclude<keyof ColumnsOf<S>, RequiredColumnName<ColumnsOf<S>>>]?:
      | ColumnInput<ColumnsOf<S>[K]["type"]>
      | undefined
  }
>

/**
 * What a patch writes for schema `S`: any subset of its columns. Defaults do not apply — a patch
 * changes only what it names — and a column given as `undefined` is left alone, as a create
 * leaves it out.
 */
export type PatchEntityValues<S extends Schema> = {
  readonly [K in keyof ColumnsOf<S>]?: ColumnInput<ColumnsOf<S>[K]["type"]> | undefined
}

type Prettify<T> = { [K in keyof T]: T[K] } & {}
