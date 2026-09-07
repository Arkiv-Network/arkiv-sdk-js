import { BLOCK_TIME } from "../consts"
import type { ExpirationTime } from "../utils/expirationTime"
import { InvalidExpiryError } from "./errors"
import { MAX_EXPIRES_AT } from "./params"

/**
 * The brand. Module-private and never exported, so the only way to obtain an {@link Expiry} is to
 * build one with {@link ExpirationTime} — a hand-written `{ minLifetime, expiresAt }` literal will
 * not typecheck, and neither will a bare number of seconds.
 */
declare const validated: unique symbol

/**
 * How long an entity should live.
 *
 * This is the pair the ABI carries, and the engine resolves it as
 * `max(expiresAt, currentBlock + minLifetime)` — whichever is later. Build one with
 * {@link ExpirationTime}; there is no other way to make one.
 *
 * Which slot a value lands in also decides which rules govern it. `minLifetime` is a duration, so
 * it must come to a whole number of blocks. `expiresAt` is a block height, which is a whole number
 * by construction, so a wall-clock date rounds into it rather than being rejected.
 */
export type Expiry = {
  /** Lifetime floor in blocks, counted from the block the transaction lands in. `0n` if unset. */
  readonly minLifetime: bigint
  /**
   * Absolute deadline: a block height, or a `Date` still to be placed against the current block.
   * `0n` if unset.
   */
  readonly expiresAt: bigint | Date
  readonly [validated]: true
}

/**
 * An expiry that is nothing but a duration — what the `ExpirationTime.from*` helpers return.
 *
 * Distinguished from a full {@link Expiry} by its `expiresAt` being the literal `0n`, which is what
 * keeps `atBlock(x, { atLeast: atBlock(y) })` from compiling: a deadline is not a floor.
 */
export type Lifetime = Expiry & { readonly expiresAt: 0n }

/**
 * Builds a branded {@link Expiry}.
 *
 * Internal seam for {@link ExpirationTime}, which is the only thing that should call it — it is not
 * part of the package's public surface.
 */
export function makeExpiry(minLifetime: bigint, expiresAt: bigint | Date): Expiry {
  return { minLifetime, expiresAt } as Expiry
}

/** The two `uint256` values the ABI carries, with every `Date` already placed. */
export type EncodedExpiry = {
  /** Absolute target block height, or `0n` for a purely relative lifetime. */
  expiresAt: bigint
  /** Relative floor in blocks, or `0n` for a purely absolute expiry. */
  minLifetime: bigint
}

/** What an expiry resolves to, given the chain's current block. */
export type ResolvedExpiry = EncodedExpiry & {
  /** The block the entity will expire at — `max(expiresAt, currentBlock + minLifetime)`. */
  target: bigint
}

/** What the SDK needs to know about the chain to resolve an expiry. */
export type ExpiryContext = {
  currentBlock: bigint
}

/**
 * Resolves an expiry into the wire pair and the block the entity will expire at.
 *
 * Durations are converted to blocks at the nominal `BLOCK_TIME` (2 seconds), which makes them
 * **approximate**: block production is not a clock, so a lifetime asked for in days drifts if the
 * chain runs fast or slow. The block it was converted to comes back as
 * {@link ResolvedExpiry.target}, so the approximation is always observable rather than assumed.
 *
 * @throws {InvalidExpiryError} If the expiry is malformed, does not fit the `uint64` the wire
 * carries, or would leave the entity dead on arrival.
 */
export function resolveExpiry(expiry: Expiry, context: ExpiryContext): ResolvedExpiry {
  const { currentBlock } = context

  if (typeof expiry?.minLifetime !== "bigint" || expiry.expiresAt === undefined) {
    throw new InvalidExpiryError(
      "expires must be built with ExpirationTime, e.g. ExpirationTime.fromDays(30) or " +
        "ExpirationTime.atBlock(1_200_000n)",
    )
  }

  const { minLifetime } = expiry
  const absolute =
    typeof expiry.expiresAt === "bigint"
      ? expiry.expiresAt
      : blockAtDate(expiry.expiresAt, currentBlock)

  if (minLifetime === 0n && absolute === 0n) {
    throw new InvalidExpiryError(
      "no expiry given. Pass ExpirationTime.fromDays(30) for a lifetime, " +
        "ExpirationTime.atBlock(n) for an absolute deadline, or a deadline with " +
        "{ atLeast } to take whichever is later.",
    )
  }

  if (absolute > MAX_EXPIRES_AT) {
    throw new InvalidExpiryError(
      `expiresAt resolves to block ${absolute}, which does not fit the uint64 the wire carries ` +
        `(max ${MAX_EXPIRES_AT}). Use ExpirationTime.permanent() for an entity that should not ` +
        "expire.",
    )
  }
  if (minLifetime > MAX_EXPIRES_AT) {
    throw new InvalidExpiryError(
      `the lifetime is ${minLifetime} blocks, which does not fit the uint64 the wire carries ` +
        `(max ${MAX_EXPIRES_AT})`,
    )
  }

  const relative = minLifetime === 0n ? 0n : currentBlock + minLifetime
  const target = absolute > relative ? absolute : relative

  if (target <= currentBlock) {
    throw new InvalidExpiryError(
      `the entity would expire at block ${target}, which is not after the current block ` +
        `${currentBlock}, so it would be dead on arrival`,
    )
  }
  if (target > MAX_EXPIRES_AT) {
    throw new InvalidExpiryError(
      `a lifetime of ${minLifetime} blocks from block ${currentBlock} lands at ${target}, past ` +
        `the largest expiry the wire carries (${MAX_EXPIRES_AT})`,
    )
  }

  return { expiresAt: absolute, minLifetime, target }
}

/**
 * A duration in seconds as a whole number of blocks.
 *
 * Arkiv counts lifetimes in blocks, so a duration that is not a whole number of them does not
 * describe anything the chain can store. Rather than silently round a caller's `3` up to two blocks
 * — four seconds, not what they asked for — this rejects it: a duration must be a positive multiple
 * of `BLOCK_TIME` (2 seconds). The {@link ExpirationTime} helpers all produce such multiples.
 *
 * @throws {InvalidExpiryError} If the duration is not a positive whole number of blocks' seconds.
 */
export function toBlocks(seconds: number): bigint {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new InvalidExpiryError(
      `a lifetime must be a positive whole number of seconds, got ${seconds}. Use the ` +
        "ExpirationTime helpers, e.g. ExpirationTime.fromDays(30).",
    )
  }
  if (seconds % BLOCK_TIME !== 0) {
    throw new InvalidExpiryError(
      `a lifetime must be a multiple of the ${BLOCK_TIME}s block time, got ${seconds}, which is ` +
        `${seconds / BLOCK_TIME} blocks. Try ${seconds - (seconds % BLOCK_TIME)} or ` +
        `${seconds + BLOCK_TIME - (seconds % BLOCK_TIME)}, or ExpirationTime.fromBlocks(n).`,
    )
  }
  return BigInt(seconds / BLOCK_TIME)
}

/**
 * The block a wall-clock instant lands on.
 *
 * Rounds **up**: a date almost never falls on a block boundary, and unlike a duration — which the
 * caller states and can state exactly — there is nothing here to reject, so the entity lives until
 * at least the instant asked for.
 */
function blockAtDate(date: Date, currentBlock: bigint): bigint {
  const secondsAway = (date.getTime() - Date.now()) / 1000
  if (secondsAway <= 0) {
    throw new InvalidExpiryError(
      `the deadline ${date.toISOString()} is in the past, so the entity would be dead on arrival`,
    )
  }
  return currentBlock + BigInt(Math.ceil(secondsAway / BLOCK_TIME))
}
