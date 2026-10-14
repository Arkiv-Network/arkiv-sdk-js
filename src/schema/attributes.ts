import { type AbiAttribute, encodeAbiAttribute, encodeTombstone } from "./codec"
import type { AnyColumn } from "./column"
import { ConflictingMutationError, SchemaDefinitionError, SchemaMismatchError } from "./errors"
import { describeColumns, isSchema, lookupColumn, SCHEMA_ATTRIBUTE, type Schema } from "./schema"
import type { ArkivValue, TypeTag } from "./types"
import { toValue, type ValueInput } from "./values"

/**
 * An entity's attributes read back without a schema, keyed by name, every value typed.
 *
 * A value read from here drops straight back into a write — the vocabulary is the same in both
 * directions.
 */
export type Attributes = Readonly<Record<string, ArkivValue>>

/**
 * The names, types and indexing of an entity's attributes, with no values — what the
 * `attributeSchema` projection returns. `indexed` is `undefined` when the node did not say.
 *
 * Useful for asking what shape the data has without paying to transfer it, and for telling apart
 * two entities that use the same name with different types.
 */
export type AttributeSchema = Readonly<
  Record<string, { type: TypeTag; indexed: boolean | undefined }>
>

/**
 * Encodes a create's values into the ABI attribute array it carries: every column the
 * values name, plus the default of every defaulted column they leave out, each flagged indexed or
 * not as its column says — and, for a named schema, the indexed tag that marks the entity as its.
 *
 * @throws {SchemaMismatchError} If a value names a column the schema lacks, a required column is
 * left out, or a value's type is not its column's.
 * @throws {MissingValueError} If a value is `null`.
 * @throws {InvalidValueError} If a value does not fit its type.
 */
export function encodeCreate(
  schema: Schema,
  values: Readonly<Record<string, unknown>>,
): AbiAttribute[] {
  assertSchema(schema)
  for (const name of keysOf(values, "create")) columnFor(schema, name, "create")

  const attributes: AbiAttribute[] = []
  if (schema.tag !== undefined) {
    attributes.push(encodeAbiAttribute(SCHEMA_ATTRIBUTE, schema.tag, true))
  }
  for (const [name, column] of Object.entries(schema.columns)) {
    const input = Object.hasOwn(values, name) ? values[name] : undefined
    if (input === undefined) {
      if (column.defaultValue !== undefined) {
        attributes.push(encodeAbiAttribute(name, column.defaultValue, column.isIndexed))
      } else if (!column.isOptional) {
        throw new SchemaMismatchError(
          name,
          `the create leaves out a required ${column.type} column. Give it a value, or declare ` +
            `it ${column.type}().optional() or with a .default(...)`,
        )
      }
      continue
    }
    attributes.push(encodeColumn(name, column, input))
  }
  return attributes.sort(byName)
}

/**
 * Encodes a patch into the ABI attribute array it carries: a write for each column in `set`, with
 * the indexed flag its column declares, and a tombstone for each name in `unset`. A column `set`
 * to `undefined` is left out, as it is from a create.
 *
 * Writing a column with a different indexed flag than the entity holds flips its indexing, so a
 * schema that marks a column `.indexed()` indexes it from the next patch that writes it.
 *
 * @throws {SchemaMismatchError} If a name is not a column, a value's type is not its column's, or
 * `unset` names a required column.
 * @throws {ConflictingMutationError} If a name appears in both `set` and `unset`.
 * @throws {MissingValueError} If a value in `set` is `null`.
 * @throws {InvalidValueError} If a value does not fit its type.
 * @throws {TypeError} If `unset` is not an array.
 */
export function encodePatch(
  schema: Schema,
  {
    set = {},
    unset = [],
  }: {
    set?: Readonly<Record<string, unknown>> | undefined
    unset?: readonly string[] | undefined
  },
): AbiAttribute[] {
  assertSchema(schema)

  const mutations: AbiAttribute[] = []
  for (const name of keysOf(set, "patch")) {
    const column = columnFor(schema, name, "patch")
    const input = set[name]
    if (input !== undefined) mutations.push(encodeColumn(name, column, input))
  }

  if (!Array.isArray(unset)) {
    throw new TypeError(`"unset" must be an array of column names`)
  }
  for (const name of new Set(unset)) {
    const column = columnFor(schema, name, "patch")
    if (!column.isOptional) {
      throw new SchemaMismatchError(
        name,
        "a required column, so unsetting it would leave the entity without a value its schema " +
          `requires. Declare it ${column.type}().optional() to allow that`,
      )
    }
    if (Object.hasOwn(set, name) && set[name] !== undefined) {
      throw new ConflictingMutationError(name)
    }
    mutations.push(encodeTombstone(name))
  }
  return mutations.sort(byName)
}

function assertSchema(schema: Schema): void {
  if (!isSchema(schema)) {
    throw new SchemaDefinitionError(
      "expected a schema built with defineSchema(...) — writes are typed by the schema they name",
    )
  }
}

function keysOf(
  values: Readonly<Record<string, unknown>>,
  operation: "create" | "patch",
): string[] {
  if (typeof values !== "object" || values === null) {
    throw new TypeError(`The ${operation} values must be an object keyed by column name`)
  }
  return Object.keys(values)
}

function columnFor(schema: Schema, name: string, operation: "create" | "patch"): AnyColumn {
  const column = lookupColumn(schema, name)
  if (column === undefined) {
    throw new SchemaMismatchError(
      name,
      `the ${operation} names a column this schema does not have. Its columns are ` +
        describeColumns(schema),
    )
  }
  return column
}

/** One column's value, resolved, checked against the column's type, and encoded. */
function encodeColumn(name: string, column: AnyColumn, input: unknown): AbiAttribute {
  const value = toValue(input as ValueInput, name)
  if (value.type !== column.type) {
    throw new SchemaMismatchError(
      name,
      `a ${column.type} column, but the value is a ${value.type}. Write ${column.type}(...) ` +
        "around the value",
    )
  }
  return encodeAbiAttribute(name, value, column.isIndexed)
}

/**
 * The engine requires attributes **strictly ascending by their `bytes32` name**: that ordering is
 * what the canonical serialization hashes into the state root, and it doubles as the uniqueness
 * check.
 */
function byName(a: AbiAttribute, b: AbiAttribute): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}
