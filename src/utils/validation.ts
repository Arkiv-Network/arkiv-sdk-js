import { BLOCK_TIME } from "../consts"
import { InvalidAttributeError, InvalidAttributeKeyError, InvalidExpirationError } from "../errors"
import type { Attribute } from "../types"

/**
 * Expiration on Arkiv is measured in blocks (1 block =
 * 2 seconds), so the value must be a positive integer that is
 * a multiple of the block time.
 *
 * @param expiresIn - The expiration in seconds.
 * @throws {InvalidExpirationError} If the value is not a positive integer that
 * is a multiple of the block time.
 */
export function validateExpiresIn(expiresIn: number): void {
  if (!Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn % BLOCK_TIME !== 0) {
    throw new InvalidExpirationError(expiresIn)
  }
}

/**
 * Validates an attribute key against the on-chain `Ident32` rules (mirrors
 * `Ident32.sol` / `validate_ident32_bytes` in the node): non-empty, at most
 * 32 bytes, leading character `a-z`, remaining characters `a-z 0-9 . - _`.
 *
 * @param key - The attribute key to validate.
 * @throws {InvalidAttributeKeyError} If the key violates the `Ident32` rules.
 */
export function validateAttributeKey(key: string): void {
  if (key.length === 0) {
    throw new InvalidAttributeKeyError(key, "key is empty")
  }
  if (!/^[a-z]/.test(key)) {
    throw new InvalidAttributeKeyError(key, `key starts with "${key[0]}"`)
  }
  const invalid = key.match(/[^a-z0-9._-]/)
  if (invalid) {
    throw new InvalidAttributeKeyError(
      key,
      `key contains "${invalid[0]}" at position ${invalid.index}`,
    )
  }
  // The charset is ASCII-only, so string length equals byte length here.
  if (key.length > 32) {
    throw new InvalidAttributeKeyError(key, `key is ${key.length} bytes long`)
  }
}

/**
 * Validates a single attribute. Keys must follow the on-chain `Ident32` rules
 * (see {@link validateAttributeKey}). Arkiv supports string and number
 * attribute values, but numeric values must be integers.
 *
 * @param attribute - The attribute to validate.
 * @throws {InvalidAttributeKeyError} If the key violates the `Ident32` rules.
 * @throws {InvalidAttributeError} If the attribute has a non-integer numeric
 * value.
 */
export function validateAttribute(attribute: Attribute): void {
  validateAttributeKey(attribute.key)
  if (typeof attribute.value === "number" && !Number.isInteger(attribute.value)) {
    throw new InvalidAttributeError(attribute.key, attribute.value)
  }
}
