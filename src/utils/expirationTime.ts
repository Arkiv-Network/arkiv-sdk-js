import { InvalidExpiryError } from "../entity/errors"
import { type Expiry, type Lifetime, makeExpiry, toBlocks } from "../entity/expiry"

/**
 * The optional floor a deadline can carry.
 *
 * `atLeast` takes a duration — one of the `from*` helpers — and never another deadline, so
 * `atBlock(x, { atLeast: atBlock(y) })` does not compile. Two deadlines are not a thing the engine
 * can resolve.
 */
export type DeadlineOptions = {
  /** Live at least this long from now, even if the deadline is sooner. */
  atLeast?: Lifetime | undefined
}

function lifetimeOf(seconds: number): Lifetime {
  return makeExpiry(toBlocks(seconds), 0n) as Lifetime
}

function deadlineOf(expiresAt: bigint | Date, options?: DeadlineOptions): Expiry {
  return makeExpiry(options?.atLeast?.minLifetime ?? 0n, expiresAt)
}

/**
 * Builds the `expires` of a create or an extension.
 *
 * Every helper returns the `{ minLifetime, expiresAt }` pair the ABI carries, so what you write is
 * what goes on the wire. The `from*` helpers fill `minLifetime` and leave `expiresAt` at `0n`;
 * {@link ExpirationTime.atBlock} and {@link ExpirationTime.atDate} do the reverse. The engine takes
 * whichever comes later, which is why a deadline can also carry a floor.
 *
 * Values are plain data — no methods, no prototype — so they log, clone and compare like any other
 * object.
 *
 * @example The 90% case: a duration, and nothing else to think about.
 * await client.createEntity({ payload, contentType, expires: ExpirationTime.fromDays(30) })
 *
 * @example An exact block, or a wall-clock date.
 * expires: ExpirationTime.atBlock(1_200_000n)
 * expires: ExpirationTime.atDate(new Date("2027-01-01"))
 *
 * @example A deadline that still guarantees a minimum life.
 * expires: ExpirationTime.atBlock(1_200_000n, { atLeast: ExpirationTime.fromDays(1) })
 */
export const ExpirationTime = {
  /**
   * A raw number of seconds. Must be a whole number of blocks' worth — see the other helpers, which
   * all produce one by construction.
   *
   * @throws {InvalidExpiryError} If the duration is not a positive multiple of the block time.
   */
  fromSeconds: (seconds: number): Lifetime => lifetimeOf(seconds),
  fromMinutes: (minutes: number): Lifetime => lifetimeOf(minutes * 60),
  fromHours: (hours: number): Lifetime => lifetimeOf(hours * 60 * 60),
  fromDays: (days: number): Lifetime => lifetimeOf(days * 24 * 60 * 60),
  fromWeeks: (weeks: number): Lifetime => lifetimeOf(weeks * 7 * 24 * 60 * 60),
  fromMonths: (months: number): Lifetime => lifetimeOf(months * 30 * 24 * 60 * 60),
  fromYears: (years: number): Lifetime => lifetimeOf(years * 365 * 24 * 60 * 60),

  /**
   * A number of blocks, for callers who think in the chain's own unit. Always exact — there is no
   * conversion to be approximate about.
   *
   * @throws {InvalidExpiryError} If the count is not a positive whole number.
   */
  fromBlocks: (blocks: number): Lifetime => {
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new InvalidExpiryError(
        `a lifetime must be a positive whole number of blocks, got ${blocks}`,
      )
    }
    return makeExpiry(BigInt(blocks), 0n) as Lifetime
  },

  /**
   * An absolute block height.
   *
   * @param block - The block the entity expires at.
   * @param options - Optionally, a floor: `{ atLeast: ExpirationTime.fromDays(1) }`.
   * @throws {InvalidExpiryError} If the height is negative.
   */
  atBlock: (block: bigint, options?: DeadlineOptions): Expiry => {
    if (typeof block !== "bigint" || block < 0n) {
      throw new InvalidExpiryError(`a deadline must be a non-negative block height, got ${block}`)
    }
    return deadlineOf(block, options)
  },

  /**
   * A wall-clock instant, placed against the block the transaction is built on.
   *
   * A date cannot land on a block boundary in general, so it rounds **up** to the next block: the
   * entity lives until at least the instant asked for. This is why a date is never rejected for
   * "not being a whole number of blocks" the way a duration is — it becomes a block height, not a
   * duration.
   *
   * @param date - When the entity should expire.
   * @param options - Optionally, a floor: `{ atLeast: ExpirationTime.fromDays(1) }`.
   * @throws {InvalidExpiryError} If the value is not a valid `Date`.
   */
  atDate: (date: Date, options?: DeadlineOptions): Expiry => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new InvalidExpiryError(`a deadline must be a valid Date, got ${String(date)}`)
    }
    return deadlineOf(date, options)
  },
}
