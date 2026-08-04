import { bytesToString, type Hex, hexToBytes, pad, size, stringToBytes, toHex } from "viem"
import { unitsToDecimal } from "./decimal"
import { InvalidValueError, UnknownAttributeTypeError } from "./errors"
import { type AnyArkivValue, makeValue, TYPE_IDS, type TypeTag, tagFromTypeId } from "./types"
import { addr, bool, bytes32, dec, decUnits, i32, key, str, u256 } from "./values"

/**
 * The `typeId` marking a tombstone — an attribute being unset. It carries a zero-length value and
 * is legal only in a patch's mutation list, never in a create.
 */
export const TOMBSTONE_TYPE_ID = 0

/**
 * An attribute in its ABI form: `(Ident32 name, uint8 typeId, bytes value)`.
 *
 * The `value` encoding is selected by `typeId`: an exact 32-byte word for the word types, the raw
 * bytes for `str` and `bytes`, and zero-length for a tombstone.
 */
export type AbiAttribute = {
  name: Hex
  typeId: number
  value: Hex
}

/**
 * Encodes a typed value into the `bytes` the ABI carries for it.
 *
 * This and {@link decodeValueBytes} are the only place the value/wire mapping is written down.
 *
 * - Word types (`bool`, `i32`, `u256`, `dec`, `bytes32`, `addr`, `key`) become exactly 32 bytes, in
 *   the encoding Solidity would use — right-aligned, and sign-extended for `i32`.
 * - `str` becomes its raw UTF-8 bytes, and `bytes` its raw bytes: variable length, no padding.
 */
export function encodeValueBytes(value: AnyArkivValue): Hex {
  switch (value.type) {
    case "bool":
      return pad(value.value ? "0x01" : "0x00", { size: 32 })
    case "i32":
      // int32 is sign-extended across the whole word, as Solidity encodes it.
      return toHex(BigInt.asUintN(256, BigInt(value.value)), { size: 32 })
    case "u256":
      return toHex(value.value, { size: 32 })
    case "dec":
      return toHex(BigInt.asUintN(256, decUnits(value)), { size: 32 })
    case "bytes32":
    case "key":
      return value.value
    case "addr":
      return pad(value.value.toLowerCase() as Hex, { size: 32 })
    case "str":
      return toHex(stringToBytes(value.value))
    case "bytes":
      return value.value
  }
}

/**
 * Decodes the ABI `bytes` of an attribute of type `tag`.
 *
 * Rejects anything a well-formed encoder would not have produced — a word type whose value is not
 * 32 bytes, an `i32` that is not sign-extended, a `bool` that is neither 0 nor 1 — rather than
 * silently truncating it.
 */
export function decodeValueBytes(tag: TypeTag, value: Hex): AnyArkivValue {
  if (tag === "str") return str(bytesToString(hexToBytes(value)))
  if (tag === "bytes") return makeValue("bytes", value.toLowerCase() as Hex)

  const width = size(value)
  if (width !== 32) {
    throw new InvalidValueError(tag, value, `a ${tag} value must be 32 bytes, got ${width}`)
  }
  const raw = BigInt(value)

  switch (tag) {
    case "bool":
      if (raw !== 0n && raw !== 1n) {
        throw new InvalidValueError("bool", value, "a bool word must hold exactly 0 or 1")
      }
      return bool(raw === 1n)
    case "i32": {
      const narrowed = BigInt.asIntN(32, raw)
      if (BigInt.asUintN(256, narrowed) !== raw) {
        throw new InvalidValueError("i32", value, "an i32 word must be sign-extended")
      }
      return i32(narrowed)
    }
    case "u256":
      return u256(raw)
    case "dec":
      return dec(unitsToDecimal(BigInt.asIntN(256, raw)))
    case "bytes32":
      return bytes32(value)
    case "key":
      return key(value)
    case "addr": {
      if (raw >> 160n !== 0n) {
        throw new InvalidValueError(
          "addr",
          value,
          "an address word must be zero-padded to 20 bytes",
        )
      }
      return addr(`0x${value.slice(-40)}`)
    }
  }
}

/**
 * Encodes a named, typed attribute into its ABI form.
 *
 * @param name - The attribute name. Assumed already validated, or a system (`$`) name the SDK sets
 * itself.
 */
export function encodeAbiAttribute(name: string, value: AnyArkivValue): AbiAttribute {
  return {
    // Ident32 is left-aligned and null-padded, which is what `toHex` does for a string.
    name: toHex(name, { size: 32 }),
    typeId: TYPE_IDS[value.type],
    value: encodeValueBytes(value),
  }
}

/** Encodes a tombstone — the mutation that unsets `name`. Legal only in a patch. */
export function encodeTombstone(name: string): AbiAttribute {
  return { name: toHex(name, { size: 32 }), typeId: TOMBSTONE_TYPE_ID, value: "0x" }
}

/**
 * Decodes an attribute value as it comes back over JSON-RPC.
 *
 * The JSON encoding follows the value's **declared type**, never its magnitude: `bool` is a JSON
 * boolean, `i32` a JSON number, `u256` a `0x` QUANTITY, `dec` a decimal string, `str` a string, and
 * the byte-shaped types `0x` DATA. Decimal strings are also accepted for the integer types, so this
 * keeps working against a node that renders them that way.
 *
 * @param typeId - The `type` the response declared, as its protocol typeId.
 * @param value - The JSON value.
 * @throws {UnknownAttributeTypeError} If the typeId names no known type.
 * @throws {InvalidValueError} If the value does not parse as that type.
 */
export function decodeRpcValue(typeId: number, value: unknown): AnyArkivValue {
  const tag = tagFromTypeId(typeId)
  if (tag === undefined) {
    throw new UnknownAttributeTypeError(typeId)
  }
  switch (tag) {
    case "bool":
      return bool(asBoolean(value))
    case "i32":
      return i32(Number(asIntegerish("i32", value)))
    case "u256":
      return u256(asIntegerish("u256", value))
    case "dec":
      return dec(asString("dec", value))
    case "bytes32":
      return bytes32(asString("bytes32", value) as Hex)
    case "key":
      return key(asString("key", value) as Hex)
    case "addr":
      return addr(asString("addr", value))
    case "str":
      return str(asString("str", value))
    case "bytes":
      return makeValue("bytes", asString("bytes", value).toLowerCase() as Hex)
  }
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value
  // Tolerated because a node may render it as text; anything else is a protocol error.
  if (value === "true" || value === "false") return value === "true"
  throw new InvalidValueError("bool", value, "not a boolean")
}

function asString(tag: TypeTag, value: unknown): string {
  if (typeof value !== "string") {
    throw new InvalidValueError(tag, value, `expected a string, got ${typeof value}`)
  }
  return value
}

/** A `0x` QUANTITY, a JSON number, or a decimal string — all of which name one integer. */
function asIntegerish(tag: TypeTag, value: unknown): bigint {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new InvalidValueError(tag, value, "not an integer")
    }
    return BigInt(value)
  }
  if (typeof value === "bigint") return value
  if (typeof value === "string") {
    if (/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value)
    if (/^-?\d+$/.test(value)) return BigInt(value)
  }
  throw new InvalidValueError(tag, value, "not an integer")
}
