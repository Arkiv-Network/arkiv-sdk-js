import { InvalidValueError } from "./errors"

/**
 * Decimal places a `dec` value is scaled by. Fixed by the protocol, so any two decimals are
 * directly comparable — and range-indexable — as plain integers.
 */
export const DECIMAL_SCALE = 18

/** 10 ** {@link DECIMAL_SCALE} — the scaling factor between a `dec` and its integer units. */
export const DECIMAL_UNIT = 10n ** BigInt(DECIMAL_SCALE)

/** The widest scaled value an `int256` holds. */
const INT256_MAX = 2n ** 255n - 1n
/** The narrowest scaled value an `int256` holds. */
const INT256_MIN = -(2n ** 255n)

/**
 * A decimal literal: an optional sign, at least one integer digit, and an optional fraction of at
 * most {@link DECIMAL_SCALE} digits. Exponents are not part of the grammar — `1e18` is a parse
 * error rather than a silent reinterpretation.
 */
const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/

/**
 * Parses a decimal literal into its scaled integer units.
 *
 * Excess fractional precision is an **error, never a rounding**: the protocol stores exactly 18
 * decimal places, and silently dropping the 19th digit would make a stored value differ from the
 * one that was written.
 *
 * @param input - The decimal literal, e.g. `"3.5"` or `"-0.000001"`.
 * @returns The value scaled by 10 ** 18.
 * @throws {InvalidValueError} If the literal is malformed, too precise, or out of `int256` range.
 */
export function decimalToUnits(input: string): bigint {
  const match = DECIMAL_RE.exec(input)
  if (!match) {
    throw new InvalidValueError(
      "dec",
      input,
      "not a decimal literal",
      'Write it as sign, digits, and an optional "." with up to 18 fractional digits — e.g. ' +
        'dec("3.5") or dec("-0.25"). Exponents such as "1e18" are not accepted.',
    )
  }

  const [, sign, whole, fraction = ""] = match
  if (fraction.length > DECIMAL_SCALE) {
    throw new InvalidValueError(
      "dec",
      input,
      `${fraction.length} fractional digits exceeds the ${DECIMAL_SCALE} the protocol stores`,
      "Round it yourself before storing — a dec is never rounded for you, so that what you " +
        "write is exactly what is stored.",
    )
  }

  const digits = BigInt(whole + fraction.padEnd(DECIMAL_SCALE, "0"))
  const units = sign === "-" ? -digits : digits
  if (units > INT256_MAX || units < INT256_MIN) {
    throw new InvalidValueError("dec", input, "exceeds the int256 range a dec is stored in")
  }
  return units
}

/**
 * Renders scaled integer units back as a canonical decimal string: no leading zeros, no trailing
 * fractional zeros, no `-0`. Parsing the result yields the same units, so this is the inverse of
 * {@link decimalToUnits} on every value it accepts.
 *
 * @param units - The value scaled by 10 ** 18.
 * @returns The canonical decimal string, e.g. `"3.5"`.
 * @throws {InvalidValueError} If the units are outside the `int256` range.
 */
export function unitsToDecimal(units: bigint): string {
  if (units > INT256_MAX || units < INT256_MIN) {
    throw new InvalidValueError("dec", units, "exceeds the int256 range a dec is stored in")
  }
  const negative = units < 0n
  const magnitude = negative ? -units : units
  const whole = magnitude / DECIMAL_UNIT
  const fraction = (magnitude % DECIMAL_UNIT).toString().padStart(DECIMAL_SCALE, "0")
  const trimmed = fraction.replace(/0+$/, "")
  const sign = negative ? "-" : ""
  return trimmed ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`
}
