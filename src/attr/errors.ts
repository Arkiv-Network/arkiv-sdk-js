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
 * handed something that is neither a tagged value nor one of the four bare forms
 * (`boolean`, `number`, `bigint`, `string`).
 */
export class UntypedValueError extends Error {
  readonly input: unknown

  constructor(input: unknown) {
    super(
      `Cannot infer an Arkiv type for ${describe(input)}. ` +
        "Attribute values must be a tagged value (i32, u256, dec, str, addr, key, bytes32, bool) " +
        "or a bare boolean, number, bigint or string.",
    )
    this.name = "UntypedValueError"
    this.input = input
  }
}

/**
 * An attribute was given `undefined` or `null` as its value.
 *
 * There is no such thing as an attribute with no value: an attribute either exists with a type, or
 * is not set. The fix is always to leave the name out of the map rather than to write an empty
 * value, so this is called out separately from {@link UntypedValueError} — the remedy is different.
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
          ? `Omit "${attributeName}" from the attributes instead — e.g. build the map ` +
            "conditionally, or drop the key when the value is absent."
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

/** More attributes were supplied than an entity operation can carry. */
export class TooManyAttributesError extends Error {
  constructor(count: number, max: number) {
    super(`An entity may carry at most ${max} attributes, got ${count}.`)
    this.name = "TooManyAttributesError"
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
