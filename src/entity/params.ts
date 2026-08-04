import type { Hex } from "viem"

/**
 * The chain-configured protocol constants the write path depends on.
 *
 * These belong to the chain, not to the SDK: the engine reads them from its own config, and a
 * client that disagrees will build transactions that revert. They live in one place so there is
 * exactly one thing to change when the chain pins them.
 *
 * @remarks
 * **Provisional.** The spec names these (`ProtocolParams.DOMAIN`, `MAX_EXPIRES_AT`,
 * `MAX_LIFETIME`) but does not give their values, and the engine does not yet expose them. The
 * values below are placeholders chosen to be structurally correct — the right shape and the right
 * relationships — not to be right. `DOMAIN` in particular is mixed into every entity key, so an
 * unpinned value means {@link predictEntityKey} predicts keys the engine will not agree with.
 */
export type ProtocolParams = {
  /**
   * The domain separator mixed into entity-key derivation. Distinguishes keys across chains and
   * protocol versions, so the same owner and nonce on two chains never collide.
   */
  domain: Hex
  /**
   * The largest absolute expiry block a client may ask for. Anything above it is a typed revert
   * rather than a truncation.
   *
   * There is no permanent entity: everything expires, and something that must outlive this bound
   * has to be extended before it does.
   */
  maxExpiresAt: bigint
  /**
   * The furthest ahead of the current block a finite expiry may be set, in blocks. Bounds how long
   * one transaction can commit the network to storing something.
   */
  maxLifetime: bigint
}

/**
 * The default protocol parameters.
 *
 * @remarks Provisional — see {@link ProtocolParams}. Pin these against the chain config before
 * relying on {@link predictEntityKey} or on client-side expiry validation matching the engine.
 */
export const DEFAULT_PROTOCOL_PARAMS: ProtocolParams = {
  // Placeholder. Must match ProtocolParams.DOMAIN on the target chain.
  domain: "0x0000000000000000000000000000000000000000000000000000000000000000",
  // Placeholder. The spec has not pinned the ceiling on an absolute expiry yet.
  maxExpiresAt: 18446744073709551615n,
  // ~5 years at a 2-second block time.
  maxLifetime: 78_840_000n,
}

/** The operation tags of the `execute` ABI's tagged union. */
export const OperationType = {
  Create: 1,
  Patch: 2,
  ExtendExpiry: 3,
  TransferOwnership: 4,
  Delete: 5,
} as const

export type OperationType = (typeof OperationType)[keyof typeof OperationType]
