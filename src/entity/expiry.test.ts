import { describe, expect, it } from "bun:test"
import { ExpirationTime } from "../utils/expirationTime"
import { InvalidExpiryError } from "./errors"
import { type Expiry, type ExpiryContext, resolveExpiry, toBlocks } from "./expiry"
import { MAX_EXPIRES_AT } from "./params"

const CURRENT_BLOCK = 1000n
const ctx: ExpiryContext = { currentBlock: CURRENT_BLOCK }

describe("what ExpirationTime builds", () => {
  it("is the wire pair itself, so what you write is what is sent", () => {
    expect(ExpirationTime.fromDays(30)).toEqual({ minLifetime: 1_296_000n, expiresAt: 0n } as never)
    expect(ExpirationTime.atBlock(1_200_000n)).toEqual({
      minLifetime: 0n,
      expiresAt: 1_200_000n,
    } as never)
  })

  it("is plain data — no prototype, no methods to lose", () => {
    const expiry = ExpirationTime.fromDays(1)
    expect(Object.getPrototypeOf(expiry)).toBe(Object.prototype)
    expect(structuredClone(expiry)).toEqual(expiry as never)
  })

  it("puts a duration in minLifetime and a deadline in expiresAt, never the other way round", () => {
    // Which slot a value lands in is what decides the rules that govern it.
    for (const lifetime of [
      ExpirationTime.fromSeconds(120),
      ExpirationTime.fromMinutes(1),
      ExpirationTime.fromHours(1),
      ExpirationTime.fromDays(1),
      ExpirationTime.fromWeeks(1),
      ExpirationTime.fromMonths(1),
      ExpirationTime.fromYears(1),
      ExpirationTime.fromBlocks(3),
    ]) {
      expect(lifetime.expiresAt).toBe(0n)
      expect(lifetime.minLifetime > 0n).toBe(true)
    }
    expect(ExpirationTime.atBlock(5n).minLifetime).toBe(0n)
    expect(ExpirationTime.atDate(new Date(Date.now() + 60_000)).minLifetime).toBe(0n)
  })
})

describe("durations — the everyday case", () => {
  it("turns a duration into a lifetime, with no block arithmetic at the call site", () => {
    const resolved = resolveExpiry(ExpirationTime.fromDays(30), ctx)
    // 30 days at 2s/block.
    expect(resolved.minLifetime).toBe(1_296_000n)
    expect(resolved.expiresAt).toBe(0n)
    expect(resolved.target).toBe(CURRENT_BLOCK + 1_296_000n)
  })

  it("counts blocks exactly, with no conversion to be approximate about", () => {
    expect(resolveExpiry(ExpirationTime.fromBlocks(7), ctx).minLifetime).toBe(7n)
    expect(() => ExpirationTime.fromBlocks(0)).toThrow(/positive whole number of blocks/)
    expect(() => ExpirationTime.fromBlocks(1.5)).toThrow(InvalidExpiryError)
  })

  it("refuses a duration that is not a whole number of blocks, at the call site", () => {
    // 3s is a block and a half. Rounding it would silently grant 4s, so it is rejected instead —
    // and it throws where it is written, not later where it is sent.
    expect(() => ExpirationTime.fromSeconds(3)).toThrow(/multiple of the 2s block time/)
    expect(() => ExpirationTime.fromSeconds(999)).toThrow(/Try 998 or 1000/)
    expect(() => ExpirationTime.fromSeconds(0)).toThrow(/positive whole number of seconds/)
    expect(() => ExpirationTime.fromSeconds(-2)).toThrow(InvalidExpiryError)
    expect(() => ExpirationTime.fromSeconds(1.5)).toThrow(InvalidExpiryError)
  })
})

describe("deadlines — the absolute case", () => {
  it("takes a block height as given", () => {
    const resolved = resolveExpiry(ExpirationTime.atBlock(5_000n), ctx)
    expect(resolved.expiresAt).toBe(5_000n)
    expect(resolved.minLifetime).toBe(0n)
    expect(resolved.target).toBe(5_000n)
  })

  it("places a Date against the block the transaction is built on", () => {
    const inAnHour = ExpirationTime.atDate(new Date(Date.now() + 3600_000))
    const resolved = resolveExpiry(inAnHour, ctx)
    // 3600s at 2s/block, counted from the current block.
    expect(resolved.expiresAt).toBe(CURRENT_BLOCK + 1800n)
    expect(resolved.target).toBe(CURRENT_BLOCK + 1800n)
  })

  it("rounds a Date up rather than rejecting it, unlike a duration", () => {
    // A wall-clock instant becomes a block HEIGHT, which is whole by construction — there is no
    // divisibility question to fail. `fromSeconds(3)` would have thrown; this cannot.
    const odd = ExpirationTime.atDate(new Date(Date.now() + 3_000))
    expect(resolveExpiry(odd, ctx).target).toBe(CURRENT_BLOCK + 2n)
  })

  it("holds the Date until it is resolved, so the value does not depend on when it was built", () => {
    const date = new Date(Date.now() + 3600_000)
    const expiry = ExpirationTime.atDate(date)
    expect(expiry.expiresAt).toEqual(date)
    // The same value resolves against whatever block it is later sent with.
    expect(resolveExpiry(expiry, { ...ctx, currentBlock: 9_000n }).target).toBe(9_000n + 1800n)
  })

  it("rejects a deadline already gone", () => {
    expect(() => resolveExpiry(ExpirationTime.atDate(new Date(Date.now() - 1000)), ctx)).toThrow(
      /in the past/,
    )
    expect(() => resolveExpiry(ExpirationTime.atBlock(CURRENT_BLOCK - 1n), ctx)).toThrow(
      /dead on arrival/,
    )
    expect(() => resolveExpiry(ExpirationTime.atBlock(CURRENT_BLOCK), ctx)).toThrow(
      /dead on arrival/,
    )
  })

  it("rejects something that is neither a block height nor a Date", () => {
    expect(() => ExpirationTime.atBlock(-1n)).toThrow(/non-negative block height/)
    expect(() => ExpirationTime.atDate(new Date("nonsense"))).toThrow(/valid Date/)
    expect(() => ExpirationTime.atBlock(5 as never)).toThrow(/non-negative block height/)
  })
})

describe("a deadline with a floor", () => {
  it("lives until whichever is later", () => {
    // The deadline is further out than the floor.
    const deadlineWins = ExpirationTime.atBlock(5_000n, {
      atLeast: ExpirationTime.fromSeconds(400),
    })
    expect(resolveExpiry(deadlineWins, ctx).target).toBe(5_000n)

    // The floor is further out than the deadline.
    const floorWins = ExpirationTime.atBlock(1_100n, { atLeast: ExpirationTime.fromDays(1) })
    expect(resolveExpiry(floorWins, ctx).target).toBe(CURRENT_BLOCK + 43_200n)
  })

  it("puts both on the wire, leaving the engine to resolve them the same way", () => {
    const resolved = resolveExpiry(
      ExpirationTime.atBlock(5_000n, { atLeast: ExpirationTime.fromSeconds(200) }),
      ctx,
    )
    expect(resolved.expiresAt).toBe(5_000n)
    expect(resolved.minLifetime).toBe(100n)
  })

  it("works the same on a date deadline", () => {
    const expiry = ExpirationTime.atDate(new Date(Date.now() + 2_000), {
      atLeast: ExpirationTime.fromDays(1),
    })
    // The date is only a second or two out, so the floor is what keeps the entity alive.
    expect(resolveExpiry(expiry, ctx).target).toBe(CURRENT_BLOCK + 43_200n)
  })

  it("treats an omitted floor as no floor", () => {
    expect(ExpirationTime.atBlock(5_000n, {}).minLifetime).toBe(0n)
    expect(ExpirationTime.atBlock(5_000n, { atLeast: undefined }).minLifetime).toBe(0n)
  })
})

describe("bounds and misuse", () => {
  it("refuses an expiry that says nothing", () => {
    // Only reachable from JS, or by hand-building the pair — the type requires ExpirationTime.
    const nothing = { minLifetime: 0n, expiresAt: 0n } as unknown as Expiry
    expect(() => resolveExpiry(nothing, ctx)).toThrow(/no expiry given/)
  })

  it("names ExpirationTime when handed something it did not build", () => {
    expect(() => resolveExpiry(2_592_000 as unknown as Expiry, ctx)).toThrow(
      /must be built with ExpirationTime/,
    )
    expect(() => resolveExpiry(undefined as unknown as Expiry, ctx)).toThrow(
      /must be built with ExpirationTime/,
    )
  })

  it("bounds an expiry only by the width of the wire field", () => {
    expect(() => resolveExpiry(ExpirationTime.atBlock(MAX_EXPIRES_AT + 1n), ctx)).toThrow(
      /does not fit the uint64/,
    )
    expect(() => resolveExpiry(ExpirationTime.atBlock(MAX_EXPIRES_AT + 1n), ctx)).toThrow(
      /ExpirationTime\.permanent\(\)/,
    )
  })
})


describe("toBlocks", () => {
  it("converts whole blocks' worth of seconds", () => {
    expect(toBlocks(2)).toBe(1n)
    expect(toBlocks(4)).toBe(2n)
    expect(toBlocks(86_400)).toBe(43_200n)
  })

  it("rejects anything that is not a positive multiple of the block time", () => {
    for (const bad of [1, 3, 999, 0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toBlocks(bad)).toThrow(InvalidExpiryError)
    }
  })
})
