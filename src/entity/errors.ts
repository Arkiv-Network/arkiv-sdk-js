/** An expiry could not be expressed, or would be rejected by the engine. */
export class InvalidExpiryError extends Error {
  constructor(reason: string) {
    super(`Invalid expiry: ${reason}`)
    this.name = "InvalidExpiryError"
  }
}

/** A `creationFlags` byte could not be built or read. */
export class InvalidCreationFlagsError extends Error {
  constructor(reason: string) {
    super(`Invalid creation flags: ${reason}`)
    this.name = "InvalidCreationFlagsError"
  }
}

/** A key salt was outside the `uint128` the wire carries. */
export class InvalidSaltError extends Error {
  constructor(salt: unknown) {
    super(
      `Invalid salt ${String(salt)}. A salt is a uint128, so it must be between 0 and ` +
        `${2n ** 128n - 1n}. Omit it to get 128 random bits, or pass NO_SALT for a key derived ` +
        `from the owner and nonce alone.`,
    )
    this.name = "InvalidSaltError"
  }
}

/** No cryptographic randomness was available to generate a salt. */
export class NoRandomSourceError extends Error {
  constructor() {
    super(
      "No cryptographic random source is available (globalThis.crypto.getRandomValues is " +
        "missing), so a key salt cannot be generated. Upgrade to Node 18+ or a modern browser, " +
        "or pass an explicit salt.",
    )
    this.name = "NoRandomSourceError"
  }
}
