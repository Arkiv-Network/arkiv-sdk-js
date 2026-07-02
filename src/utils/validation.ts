import { BLOCK_TIME } from "../consts"
import { InvalidAttributeError, InvalidExpirationError } from "../errors"
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
 * Validates a single attribute. Arkiv supports string and number attribute
 * values, but numeric values must be integers.
 *
 * @param attribute - The attribute to validate.
 * @throws {InvalidAttributeError} If the attribute has a non-integer numeric
 * value.
 */
export function validateAttribute(attribute: Attribute): void {
  if (typeof attribute.value === "number" && !Number.isInteger(attribute.value)) {
    throw new InvalidAttributeError(attribute.key, attribute.value)
  }
}
