import { bytesToString, type Hex, hexToBytes, pad, stringToBytes, toHex } from "viem"
import { unitsToDecimal } from "./decimal"
import { InvalidValueError, UnknownAttributeTypeError } from "./errors"
import {
  type AnyArkivValue,
  type ArkivValue,
  makeValue,
  TYPE_IDS,
  type TypeTag,
  tagFromTypeId,
} from "./types"
import { addr, bool, bytes32, dec, decUnits, i32, key, MAX_STRING_BYTES, str, u256 } from "./values"

const ZERO_WORD = `0x${"00".repeat(32)}` as Hex

/**
 * An attribute value as the `execute` ABI carries it: four 32-byte words. Single-word types sit in
 * word 0 in their standard Solidity encoding (right-aligned, sign-extended where Solidity would);
 * a `string` is packed left-aligned across up to all four words, which is where its 128-byte limit
 * comes from.
 */
export type ValueWords = readonly [Hex, Hex, Hex, Hex]

/** An attribute in its ABI form: `(bytes32 name, uint8 valueType, bytes32[4] value)`. */
export type AbiAttribute = {
  name: Hex
  valueType: number
  value: ValueWords
}

/**
 * Encodes a typed value into its four ABI words.
 *
 * This and {@link decodeValueWords} are the only place the value/word mapping is written down.
 *
 * @throws {InvalidValueError} If the value is the system-only `bytes` type.
 */
export function encodeValueWords(value: ArkivValue): ValueWords {
  if (value.type === "str") return packString(value.value)
  return [encodeWord0(value), ZERO_WORD, ZERO_WORD, ZERO_WORD]
}

/** The single occupied word of every type except `str`, which spans all four. */
function encodeWord0(value: Exclude<ArkivValue, { type: "str" }>): Hex {
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
  }
}

/** Packs a string's UTF-8 bytes left-aligned across the four words, zero-padded. */
function packString(value: string): ValueWords {
  const bytes = stringToBytes(value)
  if (bytes.length > MAX_STRING_BYTES) {
    throw new InvalidValueError("str", value, `exceeds the ${MAX_STRING_BYTES}-byte str limit`)
  }
  const padded = new Uint8Array(MAX_STRING_BYTES)
  padded.set(bytes)
  return [
    toHex(padded.subarray(0, 32)),
    toHex(padded.subarray(32, 64)),
    toHex(padded.subarray(64, 96)),
    toHex(padded.subarray(96, 128)),
  ]
}

/** Decodes the four ABI words of an attribute of type `tag` back into a typed value. */
export function decodeValueWords(tag: TypeTag, words: ValueWords): ArkivValue {
  if (tag === "str") {
    const packed = hexToBytes(`0x${words.map((word) => word.slice(2)).join("")}` as Hex)
    let end = packed.length
    while (end > 0 && packed[end - 1] === 0) end--
    return str(bytesToString(packed.subarray(0, end)))
  }
  if (tag === "bytes") {
    throw new InvalidValueError(
      "bytes",
      words[0],
      "system-only — never carried in an ABI attribute",
    )
  }
  const word = words[0]
  const raw = BigInt(word)
  switch (tag) {
    case "bool":
      if (raw !== 0n && raw !== 1n) {
        throw new InvalidValueError("bool", word, "a bool word must hold exactly 0 or 1")
      }
      return bool(raw === 1n)
    case "i32":
      return i32(BigInt.asIntN(32, raw))
    case "u256":
      return u256(raw)
    case "dec":
      return dec(unitsToDecimal(BigInt.asIntN(256, raw)))
    case "bytes32":
      return bytes32(word)
    case "key":
      return key(word)
    case "addr":
      return addr(`0x${word.slice(-40)}`)
  }
}

/**
 * Encodes a named, typed attribute into its ABI form.
 *
 * @param name - The attribute name. Assumed already validated by `validateAttributeName`.
 * @param value - The typed value.
 */
export function encodeAbiAttribute(name: string, value: ArkivValue): AbiAttribute {
  return {
    // Ident32 is left-aligned and null-padded, which is what `toHex` does for a string.
    name: toHex(name, { size: 32 }),
    valueType: TYPE_IDS[value.type],
    value: encodeValueWords(value),
  }
}

/**
 * Decodes an attribute value as it comes back over JSON-RPC.
 *
 * The node renders every value as a string, by type: `bool` as `"true"`/`"false"`, the numeric
 * types as decimal digits, `str` as itself, and the byte-shaped types as `0x` hex. Integers are
 * also accepted in `0x` form, so this keeps working if the node moves to the QUANTITY encoding.
 *
 * @param typeId - The `valueType` byte from the response.
 * @param rendered - The rendered value.
 * @throws {UnknownAttributeTypeError} If the typeId names no known type.
 * @throws {InvalidValueError} If the rendered value does not parse as that type.
 */
export function decodeRpcValue(typeId: number, rendered: string): AnyArkivValue {
  const tag = tagFromTypeId(typeId)
  if (tag === undefined) {
    throw new UnknownAttributeTypeError(typeId)
  }
  switch (tag) {
    case "bool":
      if (rendered !== "true" && rendered !== "false") {
        throw new InvalidValueError("bool", rendered, 'not "true" or "false"')
      }
      return bool(rendered === "true")
    case "i32":
      return i32(Number(parseSignedInteger("i32", rendered)))
    case "u256":
      return u256(rendered)
    case "dec":
      return dec(rendered)
    case "bytes32":
      return bytes32(rendered as Hex)
    case "key":
      return key(rendered as Hex)
    case "addr":
      return addr(rendered)
    case "str":
      return str(rendered)
    case "bytes":
      return makeValue("bytes", rendered.toLowerCase() as Hex)
  }
}

/** Parses a signed integer given as decimal digits or as a `0x` two's-complement word. */
function parseSignedInteger(tag: TypeTag, rendered: string): bigint {
  if (/^-?\d+$/.test(rendered)) return BigInt(rendered)
  if (/^0x[0-9a-fA-F]+$/.test(rendered)) return BigInt.asIntN(32, BigInt(rendered))
  throw new InvalidValueError(tag, rendered, "not an integer")
}
