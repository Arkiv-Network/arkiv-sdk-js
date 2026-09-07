import { type Address, encodePacked, type Hex, keccak256 } from "viem"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import { ARKIV_ADDRESS } from "../consts"
import { InvalidSaltError, NoRandomSourceError } from "./errors"

/** The widest salt the `uint128` wire field carries. */
export const MAX_SALT = 2n ** 128n - 1n

/**
 * Opts a create out of salting, as {@link CreateEntityParameters.salt}: the key is then derived
 * from the owner and its nonce alone, so anyone who knows both can work it out before the create
 * lands.
 */
export const NO_SALT = Symbol("NO_SALT")

/**
 * A salt as a caller expresses it: an explicit `uint128`, or {@link NO_SALT} to opt out of salting.
 */
export type SaltInput = bigint | typeof NO_SALT

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

/**
 * Resolves a caller-supplied salt to a `uint128`.
 */
export function resolveSalt(salt: SaltInput): bigint {
  return salt === NO_SALT ? 0n : validateSalt(salt)
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
 */
export function predictEntityKey({
  owner,
  nonce,
  salt,
  chainId,
}: {
  /** The account creating the entity. */
  owner: Address
  /**
   * The owner's entity-nonce at creation time. Each create in a batch consumes one, so the *n*th
   * create in a batch uses `nonce + n`.
   */
  nonce: bigint
  /** The salt the create will carry, or {@link NO_SALT} if it carries none. */
  salt: SaltInput
  /** The chain the entity is being created on — half of the derivation domain. */
  chainId: number
}): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "address", "address", "uint64", "uint128"],
      [BigInt(chainId), ARKIV_ADDRESS, owner, nonce, resolveSalt(salt)],
    ),
  )
}
