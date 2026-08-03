import { BLOCK_TIME } from "../consts"
import { InvalidExpirationError } from "../errors"

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
