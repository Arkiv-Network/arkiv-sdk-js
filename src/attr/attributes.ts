import { type AbiAttribute, encodeAbiAttribute } from "./codec"
import { TooManyAttributesError } from "./errors"
import { validateAttributeName } from "./names"
import type { AnyArkivValue, ArkivValue } from "./types"
import { makeValue } from "./types"
import { str, toValue, type ValueInput } from "./values"

/** The most attributes one entity may carry, excluding the system cells the SDK adds. */
export const MAX_ATTRIBUTES = 32

/** The system attribute holding an entity's opaque payload. */
const PAYLOAD_CELL = "$payload"
/** The system attribute holding an entity's content type. */
const CONTENT_TYPE_CELL = "$contentType"

/**
 * The attributes written on an entity, as a plain object keyed by attribute name.
 *
 * Values may be tagged ({@link ValueInput}) or bare where the type is unambiguous — see
 * {@link toValue} for the bare-form defaults.
 *
 * @example
 * const attributes = {
 *   level:   i32(10),
 *   balance: u256(1_000_000n),
 *   score:   dec("3.5"),
 *   parent:  key(parentKey),
 *   name:    "Bob",   // bare string -> str
 *   flagged: true,    // bare boolean -> bool
 * } satisfies AttributeInputs
 */
export type AttributeInputs = Readonly<Record<string, ValueInput>>

/**
 * The attributes read back from an entity: the same shape, with every value typed.
 *
 * A value read from here drops straight back into an {@link AttributeInputs} — the vocabulary is the
 * same in both directions.
 */
export type Attributes = Readonly<Record<string, AnyArkivValue>>

/**
 * The typed form of an attribute map: names validated, bare values resolved to their default type.
 *
 * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
 * @throws {MissingValueError} If a value is `undefined` or `null` — omit the name instead.
 * @throws {InvalidValueError} If a value does not fit the type it names or defaults to.
 * @throws {TooManyAttributesError} If there are more than {@link MAX_ATTRIBUTES} attributes.
 *
 * @example
 * resolveAttributes({ level: 10, name: "Bob" })
 * // { level: { type: "i32", value: 10 }, name: { type: "str", value: "Bob" } }
 */
export function resolveAttributes(attributes: AttributeInputs): Record<string, ArkivValue> {
  const entries = Object.entries(attributes)
  if (entries.length > MAX_ATTRIBUTES) {
    throw new TooManyAttributesError(entries.length, MAX_ATTRIBUTES)
  }
  const resolved: Record<string, ArkivValue> = {}
  for (const [name, input] of entries) {
    validateAttributeName(name)
    resolved[name] = toValue(input, name)
  }
  return resolved
}

/**
 * The payload and content type, which travel to the engine as system attributes.
 *
 * They are separate fields on the SDK's surface because that is what they are to an application —
 * an entity's contents and its type — but on the wire an operation carries no dedicated field for
 * either: `$payload` is the one `bytes`-typed cell, and `$contentType` is a `str`.
 */
export type SystemCells = {
  payload?: Uint8Array | undefined
  contentType?: string | undefined
}

/**
 * Encodes an attribute map, plus the payload and content-type system cells, into the ABI attribute
 * array an operation carries.
 *
 * The engine requires attributes **strictly ascending by their `bytes32` name**: that ordering is
 * what the canonical serialization hashes into the state root, and it doubles as the uniqueness
 * check. Sorting here means callers never have to think about it — and because the map is keyed by
 * name, duplicates cannot arise in the first place. The `$` cells sort ahead of every user
 * attribute, since `$` precedes every letter.
 *
 * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
 * @throws {MissingValueError} If a value is `undefined` or `null`.
 * @throws {InvalidValueError} If a value does not fit its type.
 * @throws {TooManyAttributesError} If there are more than {@link MAX_ATTRIBUTES} attributes.
 */
export function encodeAttributes(
  attributes: AttributeInputs = {},
  system: SystemCells = {},
): AbiAttribute[] {
  const cells: [string, AnyArkivValue][] = Object.entries(resolveAttributes(attributes))

  // Written whenever the field is given, empty or not: an empty payload is a payload, and dropping
  // it would mean the entity does not hold what the caller passed. Absence is for the operations
  // that genuinely leave a cell alone, not for a value that happens to be empty.
  if (system.payload !== undefined) {
    cells.push([PAYLOAD_CELL, makeValue("bytes", toHexBytes(system.payload))])
  }
  if (system.contentType !== undefined) {
    cells.push([CONTENT_TYPE_CELL, str(system.contentType)])
  }

  return cells
    .map(([name, value]) => encodeAbiAttribute(name, value))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Raw bytes as lowercase `0x` hex, without viem's hex-string ambiguity. */
function toHexBytes(bytes: Uint8Array): `0x${string}` {
  let out = "0x"
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out as `0x${string}`
}
