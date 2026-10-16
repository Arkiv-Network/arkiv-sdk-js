import type { TypeTag } from "./types"

/**
 * A value was rejected by its tagged constructor — out of range, wrong length, bad checksum, too
 * much precision, and so on.
 *
 * The message names the offending value and, where there is one, the type that *would* hold it, so
 * the fix is in the error rather than in the docs.
 */
export class InvalidValueError extends Error {
  /** The type tag whose constructor rejected the value. */
  readonly tag: TypeTag
  /** The rejected input, as given. */
  readonly input: unknown

  constructor(tag: TypeTag, input: unknown, reason: string, hint?: string) {
    super(`Invalid ${tag} value ${describe(input)}: ${reason}.${hint ? ` ${hint}` : ""}`)
    this.name = "InvalidValueError"
    this.tag = tag
    this.input = input
  }
}

/**
 * A bare JavaScript value could not be given a type. Raised when an attribute or predicate is
 * handed something that is neither a tagged value nor one of the five bare forms
 * (`boolean`, `number`, `bigint`, `string`, `Uint8Array`).
 */
export class UntypedValueError extends Error {
  readonly input: unknown

  constructor(input: unknown) {
    super(
      `Cannot infer an Arkiv type for ${describe(input)}. ` +
        "Attribute values must be a tagged value (i32, u64, u256, dec, str, addr, key, bytes32, " +
        "bytes, bool) or a bare boolean, number, bigint, string or Uint8Array.",
    )
    this.name = "UntypedValueError"
    this.input = input
  }
}

/**
 * An attribute was given `undefined` or `null` as its value.
 *
 * There is no such thing as an attribute with no value: an attribute either exists with a type, or
 * is not set. The fix is always to leave the name out rather than to write an empty value — or, to
 * remove a column from an existing entity, to `unset` it in a patch — so this is called out
 * separately from {@link UntypedValueError}: the remedy is different.
 *
 * `createEntity` and `patchEntity` already treat a column given as `undefined` as left out, so
 * through them only `null` raises this.
 */
export class MissingValueError extends Error {
  /** The attribute whose value was missing, when raised from an attribute map. */
  readonly attributeName: string | undefined

  constructor(input: null | undefined, attributeName?: string) {
    const subject = attributeName ? `attribute "${attributeName}"` : "attribute value"
    super(
      `The ${subject} is ${input === null ? "null" : "undefined"}. An attribute is either set ` +
        "with a value and a type or not set at all, so there is nothing to write here. " +
        (attributeName
          ? `Leave "${attributeName}" out of the values (or a patch's "set") instead — e.g. ` +
            "build the object conditionally, or drop the key when the value is absent. To remove " +
            `the column from an existing entity, list it in a patch's "unset".`
          : "Omit the attribute instead of giving it an empty value."),
    )
    this.name = "MissingValueError"
    this.attributeName = attributeName
  }
}

/** An attribute name violated the on-chain name grammar. */
export class InvalidAttributeNameError extends Error {
  readonly attributeName: string

  constructor(attributeName: string, reason: string) {
    super(
      `Invalid attribute name "${attributeName}": ${reason}. Names must be 1-32 bytes, start with ` +
        'a letter, and contain only A-Z, a-z, 0-9, ".", "-" or "_". Names are case-sensitive.',
    )
    this.name = "InvalidAttributeNameError"
    this.attributeName = attributeName
  }
}

/**
 * One patch tried to both write and remove the same attribute.
 */
export class ConflictingMutationError extends Error {
  readonly attributeName: string

  constructor(attributeName: string) {
    super(
      `The patch both sets and unsets "${attributeName}". A patch applies one mutation per ` +
        'attribute, so say which you mean: drop it from "unset" to write the value, or from ' +
        '"set" to remove the attribute.',
    )
    this.name = "ConflictingMutationError"
    this.attributeName = attributeName
  }
}

/**
 * More attributes were supplied than an entity operation can carry — raised by `defineSchema` for a
 * schema with more columns than one create could write.
 */
export class TooManyAttributesError extends Error {
  /**
   * @param tagged - Whether `count` includes a named schema's tag, which the message then calls out:
   * the tag is not among the declared columns, so the count would otherwise look off by one.
   */
  constructor(count: number, max: number, tagged = false) {
    super(
      `An entity may carry at most ${max} attributes, got ${count}.` +
        (tagged
          ? ` A named schema's tag counts as one of them, so it may declare at most ${max - 1} ` +
            "columns."
          : ""),
    )
    this.name = "TooManyAttributesError"
  }
}

/** The `bytes` values of one create or patch add up to more than `MAX_ENTITY_BYTES`. */
export class EntityTooLargeError extends Error {
  constructor(total: number, max: number) {
    super(
      `The bytes columns of one create or patch may hold at most ${max} bytes in total, got ` +
        `${total}. Split the data across entities, or store it elsewhere and keep a reference`,
    )
    this.name = "EntityTooLargeError"
  }
}

/** A schema, or one of its columns, was defined in a way the SDK or the protocol cannot honour. */
export class SchemaDefinitionError extends Error {
  /** The column at fault, when there is one. */
  readonly columnName: string | undefined

  constructor(reason: string, columnName?: string) {
    super(`Invalid schema${columnName === undefined ? "" : ` column "${columnName}"`}: ${reason}.`)
    this.name = "SchemaDefinitionError"
    this.columnName = columnName
  }
}

/**
 * Data did not fit its schema: a write named a column the schema does not have, left out one it
 * requires, or gave one a value of the wrong type — or an entity read back through a schema lacks a
 * required column or holds one with a different type.
 */
export class SchemaMismatchError extends Error {
  /** The column at fault. */
  readonly columnName: string

  constructor(columnName: string, reason: string) {
    super(`Column "${columnName}": ${reason}.`)
    this.name = "SchemaMismatchError"
    this.columnName = columnName
  }
}

/** The node sent back an attribute this SDK cannot decode. */
export class UnknownAttributeTypeError extends Error {
  /** The type as the node named it — a tag over JSON-RPC, a typeId on the wire. */
  readonly type: string | number

  constructor(type: string | number) {
    super(
      `Unknown attribute type ${describe(type)}. The node is using a type this SDK version does ` +
        "not know about — upgrade @arkiv-network/sdk.",
    )
    this.name = "UnknownAttributeTypeError"
    this.type = type
  }
}

/** Renders an arbitrary input for an error message, without ever throwing. */
function describe(input: unknown): string {
  switch (typeof input) {
    case "string":
      return JSON.stringify(input.length > 64 ? `${input.slice(0, 61)}...` : input)
    case "bigint":
      return `${input}n`
    case "object":
      return input === null ? "null" : safeJson(input)
    case "undefined":
      return "undefined"
    default:
      return String(input)
  }
}

function safeJson(input: object): string {
  try {
    return JSON.stringify(input) ?? String(input)
  } catch {
    return Object.prototype.toString.call(input)
  }
}
