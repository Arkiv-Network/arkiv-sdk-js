import type { Address, Hex } from "viem"

/**
 * The protocol's attribute type vocabulary, mapping each short **tag** (the name used by the
 * client, the query language and this SDK) to its **typeId** (the byte carried on the wire and in
 * the entity record).
 *
 * The typeIds are consensus-critical: they are written into entity records and mixed into index
 * keys, so this table must never drift from the node's `AttributeType`.
 *
 * | tag       | typeId | ABI wire type       | indexing          |
 * | --------- | ------ | ------------------- | ----------------- |
 * | `bool`    | 1      | `bool`              | equality          |
 * | `i32`     | 2      | `int32`             | equality + range  |
 * | `u256`    | 3      | `uint256`           | equality + range  |
 * | `dec`     | 4      | `int256` (18 dp)    | equality + range  |
 * | `bytes32` | 5      | `bytes32`           | equality          |
 * | `bytes`   | 6      | `bytes`             | none — system-only |
 * | `str`     | 7      | `string` (<= 128 B) | equality + prefix |
 * | `addr`    | 8      | `address`           | equality          |
 * | `key`     | 9      | `bytes32`           | equality          |
 */
export const TYPE_IDS = {
  bool: 1,
  i32: 2,
  u256: 3,
  dec: 4,
  bytes32: 5,
  bytes: 6,
  str: 7,
  addr: 8,
  key: 9,
} as const

/** Every type tag, including the system-only `bytes`. */
export type TypeTag = keyof typeof TYPE_IDS

/** Every typeId, including the system-only `6` (`bytes`). */
export type TypeId = (typeof TYPE_IDS)[TypeTag]

/**
 * The tags a client may set on an attribute. `bytes` is excluded: it backs the system `$payload`
 * cell, which travels in its own operation field and is never carried in an attribute array.
 */
export type UserTypeTag = Exclude<TypeTag, "bytes">

/** Whether a client may set an attribute of this type — everything except `bytes`. */
export function isUserSettable(tag: TypeTag): tag is UserTypeTag {
  return tag !== "bytes"
}

/**
 * Marks a value as having passed its constructor's validation. The symbol is module-private, so a
 * hand-written object literal is not assignable to {@link ArkivValue} — every value crossing the
 * wire has been range-, length- and format-checked by {@link i32}, {@link u256}, {@link dec}, and
 * friends.
 */
declare const validated: unique symbol

/**
 * A typed attribute value: the tag it was created with, plus the JavaScript representation of that
 * type. Constructed only by the tagged constructors in `@arkiv-network/sdk/attr`.
 *
 * @typeParam tag - The type tag, which also discriminates the {@link ArkivValue} union.
 * @typeParam value - The decoded JavaScript representation.
 */
export type Value<tag extends TypeTag, value> = {
  readonly type: tag
  readonly value: value
  readonly [validated]: tag
}

/** A boolean. */
export type BoolValue = Value<"bool", boolean>
/** A 32-bit signed integer — the default for an untagged number. */
export type I32Value = Value<"i32", number>
/** A 256-bit unsigned integer. */
export type U256Value = Value<"u256", bigint>
/**
 * A fixed-point decimal with 18 decimal places, held as its canonical decimal string (`"3.5"`).
 * Use {@link decUnits} for the exact scaled integer when you need to do arithmetic.
 */
export type DecValue = Value<"dec", string>
/** 32 opaque bytes, as lowercase `0x` hex. */
export type Bytes32Value = Value<"bytes32", Hex>
/** A UTF-8 string of at most 128 bytes. */
export type StrValue = Value<"str", string>
/** A 20-byte Ethereum address, as EIP-55 checksummed hex. */
export type AddrValue = Value<"addr", Address>
/** A reference to another entity. Weak by spec: dangling references are permitted. */
export type KeyValue = Value<"key", Hex>
/**
 * Opaque variable-length bytes, as lowercase `0x` hex. System-only — it backs `$payload` and is
 * never settable as an attribute, so it is produced by decoding but has no constructor.
 */
export type BytesValue = Value<"bytes", Hex>

/** Any value a client may set on an attribute. */
export type ArkivValue =
  | BoolValue
  | I32Value
  | U256Value
  | DecValue
  | Bytes32Value
  | StrValue
  | AddrValue
  | KeyValue

/** Any value that can come back from the node, including the system-only `bytes`. */
export type AnyArkivValue = ArkivValue | BytesValue

/** The value type for a given tag — e.g. `ValueOf<"u256">` is {@link U256Value}. */
export type ValueOf<tag extends TypeTag> = Extract<AnyArkivValue, { type: tag }>

/** The JavaScript representation carried by a value — e.g. `Decoded<U256Value>` is `bigint`. */
export type Decoded<value extends AnyArkivValue> = value["value"]

/**
 * Builds a validated value. Module-internal: the constructors in `values.ts` call this **after**
 * validating, which is what makes the {@link validated} brand meaningful.
 */
export function makeValue<tag extends TypeTag>(
  type: tag,
  value: Decoded<ValueOf<tag>>,
): ValueOf<tag> {
  return { type, value } as unknown as ValueOf<tag>
}

/**
 * Whether `input` has the *shape* of an {@link ArkivValue} — a known type tag and a value.
 */
export function isArkivValue(input: unknown): input is AnyArkivValue {
  return (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    "value" in input &&
    typeof (input as { type: unknown }).type === "string" &&
    // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so `{ type: "constructor" }` would
    // be accepted as a typed value and then decode to nothing.
    Object.hasOwn(TYPE_IDS, (input as { type: string }).type)
  )
}
