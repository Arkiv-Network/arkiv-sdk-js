import { Hex } from "viem"

/**
 * An entity attribute (key/value pair).
 *
 * Arkiv supports string, Hex and number values.
 *
 * Hex values are stored as the on-chain `EntityKey` type **only when they are
 * exactly 32 bytes** (66 characters, e.g. an entity key). Hex-looking strings
 * of any other length are stored as plain strings: they round-trip unchanged
 * and compare lexicographically, not as hex.
 *
 * Numeric values **must be non-negative integers** (they are stored on-chain
 * as unsigned 256-bit) — passing a non-integer (e.g. `1.5`) or negative number
 * throws an {@link InvalidAttributeError} at mutation time. To store a
 * non-integer value:
 * - Scale it to an integer (e.g. `1.5` -> `1500`, dividing by the same factor on
 *   read) to keep numeric ordering and range queries working.
 * - Or pass it as a string (e.g. `"1.5"`), which sorts lexicographically and so
 *   does not support numeric comparisons.
 *
 * To store a negative value, offset it into the non-negative range (subtracting
 * the offset on read) or store it as a string.
 */
export type Attribute = {
  key: string
  value: number | string | Hex
}
