import { InvalidCreationFlagsError } from "./errors"

/** Bit positions in the `creationFlags` byte. Bits 2-7 are reserved and must be zero. */
const READONLY_BIT = 0b0000_0001
const PERMISSIONLESS_EXTENSION_BIT = 0b0000_0010

/**
 * The immutable properties an entity is created with. Both default to `false`.
 *
 * Creation flags are fixed at creation: there is no operation that changes them, so an entity is
 * whatever it was created as for its whole life.
 */
export type CreationFlags = {
  /**
   * The entity's attributes and payload can never be changed — only its expiry extended, its
   * ownership transferred, and the entity deleted.
   */
  readonly?: boolean
  /**
   * Anyone, not just the owner, may extend the entity's expiry. Lets a third party keep something
   * alive without being able to change it.
   */
  permissionlessExtension?: boolean
}

/** {@link CreationFlags} as read back, with every flag resolved and the raw byte alongside. */
export type ResolvedCreationFlags = {
  readonly: boolean
  permissionlessExtension: boolean
  raw: number
}

/**
 * Packs creation flags into the `creationFlags` byte.
 *
 * @throws {InvalidCreationFlagsError} If a value is not a boolean.
 */
export function encodeCreationFlags(flags: CreationFlags = {}): number {
  for (const [name, value] of Object.entries(flags)) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new InvalidCreationFlagsError(`"${name}" must be a boolean, got ${typeof value}`)
    }
  }
  return (
    (flags.readonly ? READONLY_BIT : 0) |
    (flags.permissionlessExtension ? PERMISSIONLESS_EXTENSION_BIT : 0)
  )
}

/**
 * Reads the `creationFlags` byte back.
 *
 * @param raw - The `creationFlags` byte.
 * @throws {InvalidCreationFlagsError} Malformed input
 */
export function decodeCreationFlags(raw: number): ResolvedCreationFlags {
  if (!Number.isInteger(raw) || raw < 0 || raw > 0xff) {
    throw new InvalidCreationFlagsError(`${raw} is not a byte`)
  }
  return {
    readonly: (raw & READONLY_BIT) !== 0,
    permissionlessExtension: (raw & PERMISSIONLESS_EXTENSION_BIT) !== 0,
    raw,
  }
}
