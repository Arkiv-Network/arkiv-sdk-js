import { type AbiAttribute, encodeAbiAttribute } from "./codec"
import { TooManyAttributesError } from "./errors"
import { validateAttributeName } from "./names"
import type { AnyArkivValue, ArkivValue } from "./types"
import { toValue, type ValueInput } from "./values"

/** The most attributes one entity may carry. The engine reverts `TooManyAttributes` past this. */
export const MAX_ATTRIBUTES = 32

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
 * A value read from here drops straight back into an {@link AttributeInputs} or a query predicate —
 * the vocabulary is the same in both directions.
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
 * Encodes an attribute map into the ABI attribute array an operation carries.
 *
 * The engine requires attributes **strictly ascending by their `bytes32` name**: that ordering is
 * what the canonical serialization hashes into the state root, and it doubles as the uniqueness
 * check. Sorting here means callers never have to think about it — and because the map is keyed by
 * name, duplicates cannot arise in the first place.
 *
 * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
 * @throws {InvalidValueError} If a value does not fit the type it names or defaults to.
 * @throws {TooManyAttributesError} If there are more than {@link MAX_ATTRIBUTES} attributes.
 */
export function encodeAttributes(attributes: AttributeInputs): AbiAttribute[] {
  return Object.entries(resolveAttributes(attributes))
    .map(([name, value]) => encodeAbiAttribute(name, value))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
