import { type Address, encodePacked, type Hex, keccak256 } from "viem"
import { InvalidSaltError, NoRandomSourceError } from "./errors"
import type { ProtocolParams } from "./params"

/** The widest salt the `uint128` wire field carries. */
export const MAX_SALT = 2n ** 128n - 1n

/**
 * A cryptographically random 128-bit salt — what {@link CreateEntityParameters.salt} defaults to.
 *
 * The salt exists for unpredictability, not uniqueness: the per-owner nonce already guarantees
 * distinct keys. Random bits mean only the creator can predict the key of an entity they are about
 * to create, so nobody else can reference or squat it in advance.
 *
 * @throws {NoRandomSourceError} If the runtime has no `crypto.getRandomValues`.
 */
export function randomSalt(): bigint {
  const source = globalThis.crypto
  if (typeof source?.getRandomValues !== "function") {
    throw new NoRandomSourceError()
  }
  const bytes = source.getRandomValues(new Uint8Array(16))
  let salt = 0n
  for (const byte of bytes) salt = (salt << 8n) | BigInt(byte)
  return salt
}

/** Validates a caller-supplied salt against the `uint128` wire field. */
export function validateSalt(salt: bigint): bigint {
  if (typeof salt !== "bigint" || salt < 0n || salt > MAX_SALT) {
    throw new InvalidSaltError(salt)
  }
  return salt
}

/**
 * The key an entity will be created with, derived exactly as the engine derives it:
 * `keccak256(domain ++ owner ++ nonce ++ salt)`.
 *
 * Deriving it client-side is what lets a batch compose: predict the key of a create, then have a
 * later operation in the same transaction reference it, or store it as a `key` attribute on a
 * sibling entity.
 *
 * @remarks The `domain` in {@link ProtocolParams} is provisional, so a key predicted here will not
 * match the engine until it is pinned.
 */
export function predictEntityKey({
  owner,
  nonce,
  salt,
  params,
}: {
  /** The account creating the entity. */
  owner: Address
  /**
   * The owner's entity-nonce at creation time. Each create in a batch consumes one, so the *n*th
   * create in a batch uses `nonce + n`.
   */
  nonce: bigint
  /** The salt the create will carry. */
  salt: bigint
  /** The chain's protocol parameters, which supply the derivation `domain`. */
  params: ProtocolParams
}): Hex {
  return keccak256(
    encodePacked(
      ["bytes32", "address", "uint256", "uint128"],
      [params.domain, owner, nonce, validateSalt(salt)],
    ),
  )
}
