import {
  type Address,
  checksumAddress,
  type Hex,
  isAddress,
  isHex,
  stringToBytes,
  toHex,
} from "viem"
import { DECIMAL_UNIT, decimalToUnits, unitsToDecimal } from "./decimal"
import { InvalidValueError, MissingValueError, UntypedValueError } from "./errors"
import {
  type AddrValue,
  type AnyArkivValue,
  type ArkivValue,
  type BoolValue,
  type Bytes32Value,
  type BytesValue,
  type DecValue,
  type I32Value,
  isArkivValue,
  type KeyValue,
  makeValue,
  type StrValue,
  type U256Value,
} from "./types"

/** The widest `i32`. */
export const I32_MAX = 2147483647
/** The narrowest `i32`. */
export const I32_MIN = -2147483648
/** The widest `u256`. */
export const U256_MAX = 2n ** 256n - 1n
/**
 * The longest `str`, in UTF-8 bytes. A string value occupies the four words of the ABI attribute
 * slot, so 128 bytes is a wire limit rather than a policy one.
 */
export const MAX_STRING_BYTES = 128

/**
 * A boolean.
 *
 * `bool` is the one type that may also be written bare — `{ flagged: true }` and
 * `{ flagged: bool(true) }` are the same attribute.
 *
 * @example
 * bool(true) // { type: "bool", value: true }
 */
export function bool(value: boolean): BoolValue {
  if (typeof value !== "boolean") {
    throw new InvalidValueError("bool", value, "not a boolean")
  }
  return makeValue("bool", value)
}

/**
 * A 32-bit signed integer, indexed for equality and range queries. This is the default type for a
 * bare number, so `{ level: 10 }` and `{ level: i32(10) }` are the same attribute.
 *
 * @param value - An integer in [-2147483648, 2147483647].
 * @throws {InvalidValueError} If the value is not an integer, or does not fit an `i32`.
 *
 * @example
 * i32(10)   // { type: "i32", value: 10 }
 * i32(-42)  // negative values are fine — i32 is the signed integer
 */
export function i32(value: number | bigint): I32Value {
  if (typeof value === "bigint") {
    if (value > BigInt(I32_MAX) || value < BigInt(I32_MIN)) {
      throw new InvalidValueError("i32", value, outOfI32Range(value >= 0n))
    }
    return makeValue("i32", Number(value))
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidValueError("i32", value, "not a number")
  }
  if (!Number.isInteger(value)) {
    throw new InvalidValueError(
      "i32",
      value,
      "not an integer",
      `Use dec(${JSON.stringify(String(value))}) for a fixed-point decimal.`,
    )
  }
  if (value > I32_MAX || value < I32_MIN) {
    throw new InvalidValueError("i32", value, outOfI32Range(value >= 0))
  }
  return makeValue("i32", value)
}

function outOfI32Range(nonNegative: boolean): string {
  const range = `outside the i32 range [${I32_MIN}, ${I32_MAX}]`
  return nonNegative
    ? `${range} — use u256(...) for large counters and timestamps (Date.now() does not fit an i32)`
    : `${range} — use dec(...) for values that need more range than an i32`
}

/**
 * A 256-bit unsigned integer, indexed for equality and range queries. The type for counters,
 * timestamps, token amounts and block heights.
 *
 * @param value - A non-negative integer, as a `bigint`, a safe `number`, or a decimal or `0x` hex
 * string.
 * @throws {InvalidValueError} If the value is negative, non-integral, or wider than 256 bits.
 *
 * @example
 * u256(1_000_000n)
 * u256(Date.now())        // safe integers are accepted
 * u256("0xf4240")         // hex, as it comes back over JSON-RPC
 */
export function u256(value: bigint | number | string): U256Value {
  const parsed = toU256Bigint(value)
  if (parsed < 0n) {
    throw new InvalidValueError(
      "u256",
      value,
      "negative — u256 is unsigned",
      "Use i32(...) for small signed integers, or dec(...) for a signed fixed-point value.",
    )
  }
  if (parsed > U256_MAX) {
    throw new InvalidValueError("u256", value, "wider than 256 bits")
  }
  return makeValue("u256", parsed)
}

function toU256Bigint(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new InvalidValueError(
        "u256",
        value,
        "not an integer",
        `Use dec(${JSON.stringify(String(value))}) for a fixed-point decimal.`,
      )
    }
    if (!Number.isSafeInteger(value)) {
      throw new InvalidValueError(
        "u256",
        value,
        "beyond the safe integer range, so it may already have lost precision",
        "Pass it as a bigint literal (e.g. 12345678901234567890n) or a string instead.",
      )
    }
    return BigInt(value)
  }
  if (typeof value === "string") {
    if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(value)) {
      throw new InvalidValueError("u256", value, "not a decimal or 0x-hex integer")
    }
    return BigInt(value)
  }
  throw new InvalidValueError("u256", value, "not a bigint, number or string")
}

/**
 * A signed fixed-point decimal with exactly 18 decimal places, indexed for equality and range
 * queries.
 *
 * Pass fractional values as **strings**. A JavaScript number cannot represent most decimals
 * exactly, so accepting `dec(0.1 + 0.2)` would quietly store `0.30000000000000004`; requiring the
 * string keeps what you write and what is stored the same thing. Excess precision is likewise an
 * error rather than a rounding.
 *
 * @param value - A decimal string, or an integral `number` / `bigint`.
 * @throws {InvalidValueError} If the value is malformed, has more than 18 fractional digits, or
 * falls outside the `int256` range.
 *
 * @example
 * dec("3.5")
 * dec("-0.000000000000000001")  // the smallest step
 * dec(5)                        // integers may be passed bare
 */
export function dec(value: string | number | bigint): DecValue {
  if (typeof value === "string") {
    return makeValue("dec", unitsToDecimal(decimalToUnits(value)))
  }
  if (typeof value === "bigint") {
    return decFromUnits(value * DECIMAL_UNIT)
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidValueError("dec", value, "not a number")
  }
  if (!Number.isInteger(value)) {
    throw new InvalidValueError(
      "dec",
      value,
      "a fractional number cannot be represented exactly in binary floating point",
      `Pass it as a string instead: dec(${JSON.stringify(String(value))}).`,
    )
  }
  return decFromUnits(BigInt(value) * DECIMAL_UNIT)
}

/**
 * The exact scaled integer behind a `dec` — the value multiplied by 10 ** 18, which is what the
 * protocol stores and compares. Use it when you need exact arithmetic; JavaScript has no native
 * decimal type, so the SDK carries the canonical string and leaves the maths to you.
 *
 * @example
 * decUnits(dec("3.5"))  // 3500000000000000000n
 */
export function decUnits(value: DecValue): bigint {
  return decimalToUnits(value.value)
}

/**
 * A `dec` built from its scaled integer units — the inverse of {@link decUnits}.
 *
 * @example
 * decFromUnits(3_500_000_000_000_000_000n)  // dec("3.5")
 */
export function decFromUnits(units: bigint): DecValue {
  return makeValue("dec", unitsToDecimal(units))
}

/**
 * A UTF-8 string of at most 128 bytes, indexed for equality and prefix (`STARTSWITH`) matching.
 *
 * The limit is on **bytes**, not characters: a string of 128 emoji does not fit.
 *
 * @throws {InvalidValueError} If the string exceeds 128 UTF-8 bytes.
 *
 * @example
 * str("Bob")
 */
export function str(value: string): StrValue {
  if (typeof value !== "string") {
    throw new InvalidValueError("str", value, "not a string")
  }
  const bytes = stringToBytes(value).length
  if (bytes > MAX_STRING_BYTES) {
    throw new InvalidValueError(
      "str",
      value,
      `${bytes} UTF-8 bytes exceeds the ${MAX_STRING_BYTES}-byte limit on a str`,
      "Store the long form in the entity payload and keep a short, queryable key here.",
    )
  }
  return makeValue("str", value)
}

/**
 * A 20-byte Ethereum address, indexed for equality.
 *
 * All-lowercase and all-uppercase input carries no checksum and is accepted as-is; mixed-case
 * input is checked against its EIP-55 checksum, so a mistyped address is caught here rather than
 * being written to a wrong account. The stored value is always EIP-55 checksummed.
 *
 * @throws {InvalidValueError} If the value is not 20 hex bytes, or fails its EIP-55 checksum.
 *
 * @example
 * addr("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")
 */
export function addr(value: string): AddrValue {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new InvalidValueError("addr", value, "not a 20-byte 0x-prefixed hex address")
  }
  const body = value.slice(2)
  const cased = body !== body.toLowerCase() && body !== body.toUpperCase()
  if (cased && !isAddress(value, { strict: true })) {
    throw new InvalidValueError(
      "addr",
      value,
      "fails its EIP-55 checksum, so a digit is probably mistyped",
      `If those hex digits are right, the correctly checksummed form is ` +
        `${checksumAddress(value as Address)}.`,
    )
  }
  return makeValue("addr", checksumAddress(value as Address))
}

/**
 * A reference to another entity, indexed for equality.
 *
 * References are **weak**: nothing checks that the target exists when you write it, and a
 * reference to a deleted or expired entity is allowed to dangle.
 *
 * @param value - A 32-byte entity key, as `0x` hex or raw bytes.
 * @throws {InvalidValueError} If the value is not exactly 32 bytes.
 *
 * @example
 * key(parentEntityKey)
 */
export function key(value: Hex | Uint8Array): KeyValue {
  return makeValue("key", asFixedHex("key", value, 32))
}

/**
 * 32 opaque bytes — a hash, a digest, an identifier from another system — indexed for equality.
 *
 * Use {@link key} instead when the bytes are an Arkiv entity key: same wire width, but the
 * distinct type makes the reference visible to readers and to the query language.
 *
 * @param value - 32 bytes, as `0x` hex or raw bytes.
 * @throws {InvalidValueError} If the value is not exactly 32 bytes.
 *
 * @example
 * bytes32(keccak256(toBytes("hello")))
 */
export function bytes32(value: Hex | Uint8Array): Bytes32Value {
  return makeValue("bytes32", asFixedHex("bytes32", value, 32))
}

/** Normalizes hex-or-bytes input of a known width into lowercase `0x` hex. */
function asFixedHex(tag: "key" | "bytes32", value: Hex | Uint8Array, size: number): Hex {
  if (value instanceof Uint8Array) {
    if (value.length !== size) {
      throw new InvalidValueError(tag, `<${value.length} bytes>`, `not exactly ${size} bytes`)
    }
    return toHex(value)
  }
  if (typeof value !== "string" || !isHex(value, { strict: true })) {
    throw new InvalidValueError(tag, value, "not 0x-prefixed hex")
  }
  if (value.length !== 2 + size * 2) {
    throw new InvalidValueError(
      tag,
      value,
      `${(value.length - 2) / 2} bytes, not exactly ${size} bytes`,
    )
  }
  return value.toLowerCase() as Hex
}

/**
 * A JavaScript value accepted wherever a typed value is expected: either a tagged value, or one of
 * the four bare forms that map unambiguously onto a single type.
 *
 * | bare form | type    |
 * | --------- | ------- |
 * | `boolean` | `bool`  |
 * | `number`  | `i32`   |
 * | `bigint`  | `u256`  |
 * | `string`  | `str`   |
 *
 * Anything else — a large number, a decimal, an address, an entity key — must name its type, which
 * is what keeps `"0x1234..."` a string rather than silently becoming a key.
 */
export type ValueInput = ArkivValue | boolean | number | bigint | string

/**
 * Resolves a {@link ValueInput} to a typed value, applying the bare-form defaults above. Tagged
 * values pass through untouched.
 *
 * @param input - The value to resolve.
 * @param attributeName - The attribute this value belongs to, used to make errors name it.
 *
 * @throws {MissingValueError} If the input is `undefined` or `null` — an attribute is either set
 * with a value and a type, or not set at all.
 * @throws {UntypedValueError} If the input is not a tagged value or a bare boolean, number, bigint
 * or string.
 * @throws {InvalidValueError} If a bare value does not fit the type it defaults to.
 *
 * @example
 * toValue(10)          // i32(10)
 * toValue(10n)         // u256(10n)
 * toValue("hello")     // str("hello")
 * toValue(dec("3.5"))  // unchanged
 */
export function toValue(input: ValueInput, attributeName?: string): ArkivValue {
  // `undefined` and `null` are rejected before the type switch. They are not assignable to
  // ValueInput, but they still arrive at runtime — from a spread of an optional-shaped object, or
  // from data that never went through the type system — and "cannot infer a type for undefined"
  // does not tell you the fix, which is always to leave the attribute out.
  if (input === undefined || input === null) {
    throw new MissingValueError(input, attributeName)
  }
  switch (typeof input) {
    case "boolean":
      return bool(input)
    case "number":
      return i32(input)
    case "bigint":
      return u256(input)
    case "string":
      return str(input)
    default: {
      // Widened to AnyArkivValue: `bytes` is not a member of ValueInput, but it is what a decoded
      // `$payload` carries, so a round-trip through a decoded entity must be rejected by name
      // rather than fall through to "cannot infer a type".
      const candidate = input as AnyArkivValue
      if (isArkivValue(candidate)) {
        if (candidate.type === "bytes") {
          throw new InvalidValueError(
            "bytes",
            candidate.value,
            "system-only — bytes backs the entity payload and cannot be set as an attribute",
            "Pass the bytes as the entity payload instead.",
          )
        }
        return revalidate(candidate)
      }
      throw new UntypedValueError(input)
    }
  }
}

/**
 * Re-runs a tagged value through its own constructor.
 *
 * {@link isArkivValue} can only check shape — the `validated` brand is a type-level construct with
 * no runtime existence, so a hand-written `{ type: "u256", value: "1000" }` (from `JSON.parse`, a
 * config file, an `as any` boundary) is indistinguishable from a real `u256(1000n)`. Passing it
 * through unchecked was silent corruption rather than an error: the ABI encoder would take the
 * *string* "1000" and write its UTF-8 bytes into the word, storing 2.27e76 on chain.
 *
 * Running the constructor again is what makes the brand's promise — "every value crossing the wire
 * has been range-, length- and format-checked" — true at runtime. For a value that really did come
 * from a constructor it is a no-op that returns an equal value.
 */
function revalidate(value: Exclude<AnyArkivValue, BytesValue>): ArkivValue {
  switch (value.type) {
    case "bool":
      return bool(value.value)
    case "i32":
      return i32(value.value)
    case "u256":
      return u256(value.value)
    case "dec":
      return dec(value.value)
    case "bytes32":
      return bytes32(value.value)
    case "str":
      return str(value.value)
    case "addr":
      return addr(value.value)
    case "key":
      return key(value.value)
  }
}
