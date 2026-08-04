import { InvalidCreationFlagsError } from "./errors"

/** Bit positions in the `creationFlags` byte. Bits 2-7 are reserved and must be zero. */
const READONLY_BIT = 0b0000_0001
const PERMISSIONLESS_EXTENSION_BIT = 0b0000_0010
const RESERVED_BITS = 0b1111_1100

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
  /** The underlying byte, so a flag this SDK version does not know about is still visible. */
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
 * @throws {InvalidCreationFlagsError} If the byte is out of range or sets a reserved bit — a
 * reserved bit means the entity was written by something that knows a flag this SDK does not, so
 * guessing at its meaning would be worse than saying so.
 */
export function decodeCreationFlags(raw: number): ResolvedCreationFlags {
  if (!Number.isInteger(raw) || raw < 0 || raw > 0xff) {
    throw new InvalidCreationFlagsError(`${raw} is not a byte`)
  }
  if ((raw & RESERVED_BITS) !== 0) {
    throw new InvalidCreationFlagsError(
      `reserved bits are set in 0b${raw.toString(2).padStart(8, "0")} — the entity uses a ` +
        "creation flag this SDK version does not know about; upgrade @arkiv-network/sdk",
    )
  }
  return {
    readonly: (raw & READONLY_BIT) !== 0,
    permissionlessExtension: (raw & PERMISSIONLESS_EXTENSION_BIT) !== 0,
    raw,
  }
}
