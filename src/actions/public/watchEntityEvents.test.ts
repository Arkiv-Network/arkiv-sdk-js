import { describe, expect, it } from "bun:test"
import { type Abi, encodeAbiParameters, encodeEventTopics, getAbiItem, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { ARKIV_ADDRESS } from "../../consts"
import { ENTITY_EVENTS_ABI, type EntityEventName } from "../../entity/events"
import type { EntityEvent, EntityExpiredEvent } from "../../types/events"
import { watchEntityEvents } from "./watchEntityEvents"

const KEY_A = `0x${"aa".repeat(32)}` as Hex
const KEY_B = `0x${"bb".repeat(32)}` as Hex
const ALICE = "0x1111111111111111111111111111111111111111" as const
const BOB = "0x2222222222222222222222222222222222222222" as const

/**
 * The head when a watcher starts. Logs default to block 100, so everything the tests emit is
 * "live" — after this block — unless a test deliberately places it earlier.
 */
const HEAD = 50n

type Log = {
  topics: Hex[]
  data: Hex
  blockNumber: bigint | null
  transactionHash: Hex | null
  logIndex: number | null
}

/**
 * Builds the log the engine would emit for an event, from the same ABI the watcher decodes with.
 *
 * Encoding rather than hand-writing topics is what keeps the test honest about the indexed/
 * non-indexed split: change the ABI and the log changes with it.
 */
function logFor(
  eventName: EntityEventName,
  args: Record<string, unknown>,
  position: { blockNumber?: bigint; transactionHash?: Hex; logIndex?: number } = {},
): Log {
  const item = getAbiItem({ abi: ENTITY_EVENTS_ABI as Abi, name: eventName })
  if (item === undefined || item.type !== "event") throw new Error(`no event ${eventName}`)

  const unindexed = item.inputs.filter((input) => !("indexed" in input && input.indexed))
  return {
    topics: encodeEventTopics({
      abi: ENTITY_EVENTS_ABI,
      eventName,
      // biome-ignore lint/suspicious/noExplicitAny: the arg shape varies per event by design.
      args: args as any,
    }) as Hex[],
    data:
      unindexed.length === 0
        ? "0x"
        : encodeAbiParameters(
            unindexed,
            unindexed.map((input) => args[input.name ?? ""]),
          ),
    blockNumber: position.blockNumber ?? 100n,
    transactionHash: position.transactionHash ?? (`0x${"cc".repeat(32)}` as Hex),
    logIndex: position.logIndex ?? 0,
  }
}

type Harness = {
  client: ArkivClient
  /** Feeds logs to the watcher, as the poller would. */
  emitLogs: (logs: Log[]) => void
  /** Advances the block height the watcher sees. */
  emitBlock: (blockNumber: bigint) => void
  /** Raises a transport error on the log watcher. */
  failLogs: (error: Error) => void
  watchEventCalls: Record<string, unknown>[]
  watchBlockNumberCalls: Record<string, unknown>[]
  stops: string[]
}

/** A client that hands back its watcher callbacks so a test can drive them directly. */
function harness(): Harness {
  const state: Partial<{
    onLogs: (logs: Log[]) => void
    onLogsError: (error: Error) => void
    onBlockNumber: (blockNumber: bigint) => void
  }> = {}
  const watchEventCalls: Record<string, unknown>[] = []
  const watchBlockNumberCalls: Record<string, unknown>[] = []
  const stops: string[] = []

  const client = {
    // biome-ignore lint/suspicious/noExplicitAny: a stand-in for viem's generic watcher.
    watchEvent(parameters: any) {
      watchEventCalls.push(parameters)
      state.onLogs = parameters.onLogs
      state.onLogsError = parameters.onError
      return () => stops.push("logs")
    },
    // biome-ignore lint/suspicious/noExplicitAny: a stand-in for viem's generic watcher.
    watchBlockNumber(parameters: any) {
      watchBlockNumberCalls.push(parameters)
      state.onBlockNumber = parameters.onBlockNumber
      return () => stops.push("blocks")
    },
  } as unknown as ArkivClient

  return {
    client,
    emitLogs: (logs) => state.onLogs?.(logs),
    emitBlock: (blockNumber) => state.onBlockNumber?.(blockNumber),
    failLogs: (error) => state.onLogsError?.(error),
    watchEventCalls,
    watchBlockNumberCalls,
    stops,
  }
}

/** Runs `body` with `console.error` captured, so a test can assert on the default error path. */
function captureConsoleError(body: () => void): unknown[][] {
  const calls: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    calls.push(args)
  }
  try {
    body()
  } finally {
    console.error = original
  }
  return calls
}

describe("decoding the five on-chain events", () => {
  it("decodes a create, with the position it was applied at", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onEntityCreated: (event) => seen.push(event) })

    h.emitLogs([
      logFor(
        "EntityCreated",
        { entityKey: KEY_A, owner: ALICE, expiresAt: 1_200_000n },
        { blockNumber: 42n, logIndex: 3 },
      ),
    ])

    expect(seen).toEqual([
      {
        type: "EntityCreated",
        entityKey: KEY_A,
        owner: ALICE,
        expiresAt: 1_200_000n,
        blockNumber: 42n,
        transactionHash: `0x${"cc".repeat(32)}`,
        logIndex: 3,
      },
    ])
  })

  it("decodes a patch", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onEntityPatched: (event) => seen.push(event) })

    h.emitLogs([logFor("EntityPatched", { entityKey: KEY_A, owner: ALICE })])

    expect(seen).toMatchObject([{ type: "EntityPatched", entityKey: KEY_A, owner: ALICE }])
  })

  it("decodes an extension", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onExpiryExtended: (event) => seen.push(event) })

    h.emitLogs([logFor("ExpiryExtended", { entityKey: KEY_A, expiresAt: 999n })])

    expect(seen).toMatchObject([{ type: "ExpiryExtended", entityKey: KEY_A, expiresAt: 999n }])
  })

  it("decodes a transfer, naming both sides", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onOwnershipTransferred: (event) => seen.push(event) })

    h.emitLogs([
      logFor("OwnershipTransferred", { entityKey: KEY_A, previousOwner: ALICE, newOwner: BOB }),
    ])

    expect(seen).toMatchObject([
      { type: "OwnershipTransferred", entityKey: KEY_A, previousOwner: ALICE, newOwner: BOB },
    ])
  })

  it("decodes a delete", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onEntityDeleted: (event) => seen.push(event) })

    h.emitLogs([logFor("EntityDeleted", { entityKey: KEY_A, owner: ALICE })])

    expect(seen).toMatchObject([{ type: "EntityDeleted", entityKey: KEY_A, owner: ALICE }])
  })
})

describe("onEvent", () => {
  it("receives every event in the order it was applied", () => {
    const h = harness()
    const seen: string[] = []
    watchEntityEvents(h.client, { onEvent: (event) => seen.push(event.type) })

    h.emitLogs([
      logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 500n }, { logIndex: 0 }),
      logFor("EntityPatched", { entityKey: KEY_A, owner: ALICE }, { logIndex: 1 }),
      logFor(
        "OwnershipTransferred",
        { entityKey: KEY_A, previousOwner: ALICE, newOwner: BOB },
        { logIndex: 2 },
      ),
      logFor("EntityDeleted", { entityKey: KEY_A, owner: BOB }, { logIndex: 3 }),
    ])

    expect(seen).toEqual([
      "EntityCreated",
      "EntityPatched",
      "OwnershipTransferred",
      "EntityDeleted",
    ])
  })

  it("runs before the per-event handler for the same event", () => {
    const h = harness()
    const order: string[] = []
    watchEntityEvents(h.client, {
      onEvent: () => order.push("onEvent"),
      onEntityCreated: () => order.push("onEntityCreated"),
    })

    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 1n })])

    expect(order).toEqual(["onEvent", "onEntityCreated"])
  })

  it("does not carry synthesized expiries — they are not operations", () => {
    const h = harness()
    const seen: string[] = []
    watchEntityEvents(h.client, {
      onEvent: (event) => seen.push(event.type),
      onEntityExpired: () => seen.push("EntityExpired"),
    })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])
    h.emitBlock(200n)

    expect(seen).toEqual(["EntityCreated", "EntityExpired"])
  })
})

describe("synthesized expiry", () => {
  it("fires once, at the block the entity was set to expire at", () => {
    const h = harness()
    const seen: EntityExpiredEvent[] = []
    watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event) })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])

    h.emitBlock(199n)
    expect(seen).toEqual([])

    h.emitBlock(200n)
    expect(seen).toEqual([
      { type: "EntityExpired", entityKey: KEY_A, expiresAt: 200n, observedAtBlock: 200n },
    ])

    // Removed as it fired, so a later block does not repeat it.
    h.emitBlock(201n)
    expect(seen).toHaveLength(1)
  })

  it("reports the block it observed, which may be past the expiry", () => {
    const h = harness()
    const seen: EntityExpiredEvent[] = []
    watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event) })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])
    // Polling can skip blocks, so the first block at-or-after the expiry is not always the expiry.
    h.emitBlock(217n)

    expect(seen[0]).toEqual({
      type: "EntityExpired",
      entityKey: KEY_A,
      expiresAt: 200n,
      observedAtBlock: 217n,
    })
  })

  it("follows an extension rather than the original expiry", () => {
    const h = harness()
    const seen: EntityExpiredEvent[] = []
    watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event) })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])
    h.emitLogs([
      logFor("ExpiryExtended", { entityKey: KEY_A, expiresAt: 500n }, { blockNumber: 150n }),
    ])

    h.emitBlock(300n)
    expect(seen).toEqual([])

    h.emitBlock(500n)
    expect(seen).toMatchObject([{ entityKey: KEY_A, expiresAt: 500n }])
  })

  it("tracks an entity whose create it missed, once an extension names an expiry", () => {
    const h = harness()
    const seen: EntityExpiredEvent[] = []
    watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event) })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("ExpiryExtended", { entityKey: KEY_B, expiresAt: 300n })])
    h.emitBlock(300n)

    expect(seen).toMatchObject([{ entityKey: KEY_B, expiresAt: 300n }])
  })

  it("does not fire for an entity deleted before its expiry", () => {
    const h = harness()
    const seen: EntityExpiredEvent[] = []
    watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event) })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])
    h.emitLogs([logFor("EntityDeleted", { entityKey: KEY_A, owner: ALICE }, { blockNumber: 150n })])
    h.emitBlock(500n)

    expect(seen).toEqual([])
  })

  it("fires every entity due at the same block", () => {
    const h = harness()
    const seen: Hex[] = []
    watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event.entityKey) })

    h.emitBlock(HEAD)
    h.emitLogs([
      logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n }),
      logFor("EntityCreated", { entityKey: KEY_B, owner: BOB, expiresAt: 150n }),
    ])
    h.emitBlock(200n)

    expect(seen).toEqual([KEY_A, KEY_B])
  })

  it("does not start a block watcher when nobody is listening for expiries", () => {
    const h = harness()
    watchEntityEvents(h.client, { onEntityCreated: () => {} })

    expect(h.watchBlockNumberCalls).toHaveLength(0)
  })

  describe("replayed history", () => {
    it("is not tracked — its expiry may already have been superseded", () => {
      const h = harness()
      const created: EntityEvent[] = []
      const expired: EntityExpiredEvent[] = []
      watchEntityEvents(h.client, {
        onEntityCreated: (event) => created.push(event),
        onEntityExpired: (event) => expired.push(event),
      })

      h.emitBlock(HEAD)
      // A create from before the watcher started: it may since have been extended by a log the
      // stream has not replayed yet, so its expiry is not evidence the entity is gone.
      h.emitLogs([
        logFor(
          "EntityCreated",
          { entityKey: KEY_A, owner: ALICE, expiresAt: 60n },
          { blockNumber: 10n },
        ),
      ])
      h.emitBlock(1_000n)

      // Still delivered as a create — only the expiry synthesis abstains.
      expect(created).toHaveLength(1)
      expect(expired).toEqual([])
    })

    it("starts being tracked again once a live event names the expiry", () => {
      const h = harness()
      const expired: EntityExpiredEvent[] = []
      watchEntityEvents(h.client, { onEntityExpired: (event) => expired.push(event) })

      h.emitBlock(HEAD)
      h.emitLogs([
        logFor(
          "EntityCreated",
          { entityKey: KEY_A, owner: ALICE, expiresAt: 60n },
          { blockNumber: 10n },
        ),
      ])
      // The extension the replay had not reached yet, now arriving live.
      h.emitLogs([
        logFor("ExpiryExtended", { entityKey: KEY_A, expiresAt: 900n }, { blockNumber: 100n }),
      ])
      h.emitBlock(900n)

      expect(expired).toMatchObject([{ entityKey: KEY_A, expiresAt: 900n }])
    })

    it("sweeps nothing on the very first tick, which only establishes the start head", () => {
      const h = harness()
      const expired: EntityExpiredEvent[] = []
      watchEntityEvents(h.client, { onEntityExpired: (event) => expired.push(event) })

      h.emitLogs([
        logFor(
          "EntityCreated",
          { entityKey: KEY_A, owner: ALICE, expiresAt: 10n },
          { blockNumber: 5n },
        ),
      ])
      // `emitOnBegin` delivers the current head immediately, long past this entity's expiry. Firing
      // here would announce the expiry of an entity the watcher has no current knowledge of.
      h.emitBlock(1_000n)

      expect(expired).toEqual([])
    })
  })
})

describe("the watcher itself", () => {
  it("only listens to the Arkiv operation address", () => {
    const h = harness()
    watchEntityEvents(h.client, { onEntityCreated: () => {} })

    expect(h.watchEventCalls[0]).toMatchObject({ address: ARKIV_ADDRESS })
  })

  it("polls twice a block by default, on both watchers", () => {
    const h = harness()
    watchEntityEvents(h.client, { onEntityCreated: () => {}, onEntityExpired: () => {} })

    // Blocks are 2s, so a default that leaves an event a whole block stale is too slow.
    expect(h.watchEventCalls[0]).toMatchObject({ pollingInterval: 1000 })
    expect(h.watchBlockNumberCalls[0]).toMatchObject({ pollingInterval: 1000 })
  })

  it("forwards fromBlock and pollingInterval, and omits fromBlock when unset", () => {
    const withOptions = harness()
    watchEntityEvents(withOptions.client, {
      onEntityCreated: () => {},
      fromBlock: 90n,
      pollingInterval: 250,
    })
    expect(withOptions.watchEventCalls[0]).toMatchObject({ fromBlock: 90n, pollingInterval: 250 })

    const bare = harness()
    watchEntityEvents(bare.client, { onEntityCreated: () => {} })
    expect(bare.watchEventCalls[0]).not.toHaveProperty("fromBlock")
  })

  it("stops both watchers when unwatched", () => {
    const h = harness()
    const unwatch = watchEntityEvents(h.client, {
      onEntityCreated: () => {},
      onEntityExpired: () => {},
    })

    expect(h.stops).toEqual([])
    unwatch()
    expect(h.stops).toEqual(["logs", "blocks"])
  })

  it("drops what it can no longer track after unwatching", () => {
    const h = harness()
    const seen: EntityExpiredEvent[] = []
    const unwatch = watchEntityEvents(h.client, { onEntityExpired: (event) => seen.push(event) })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])
    unwatch()
    // The real poller is stopped, but a tick already in flight must not resurrect a dead watcher.
    h.emitBlock(500n)

    expect(seen).toEqual([])
  })

  it("skips a log with no position rather than inventing one", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onEvent: (event) => seen.push(event) })

    const log = logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 1n })
    h.emitLogs([{ ...log, blockNumber: null }])
    h.emitLogs([{ ...log, transactionHash: null }])
    h.emitLogs([{ ...log, logIndex: null }])

    expect(seen).toEqual([])
  })

  it("reports a log it cannot decode instead of throwing out of the poller", () => {
    const h = harness()
    const errors: Error[] = []
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, {
      onEvent: (event) => seen.push(event),
      onError: (error) => errors.push(error),
    })

    const good = logFor("EntityDeleted", { entityKey: KEY_A, owner: ALICE })
    // A create's topic with no data — the expiresAt word is missing.
    const broken = {
      ...logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 1n }),
      data: "0x" as Hex,
    }

    expect(() => h.emitLogs([broken, good])).not.toThrow()
    expect(errors).toHaveLength(1)
    // The rest of the batch still gets through.
    expect(seen).toMatchObject([{ type: "EntityDeleted" }])
  })

  it("forwards transport errors", () => {
    const h = harness()
    const errors: Error[] = []
    watchEntityEvents(h.client, {
      onEntityCreated: () => {},
      onError: (error) => errors.push(error),
    })

    const boom = new Error("transport died")
    h.failLogs(boom)

    expect(errors).toEqual([boom])
  })

  it("logs to the console when no onError was given, so a dead watcher is not silent", () => {
    const h = harness()
    watchEntityEvents(h.client, { onEntityCreated: () => {} })

    const boom = new Error("filter not found")
    const logged = captureConsoleError(() => h.failLogs(boom))

    expect(logged).toEqual([["watchEntityEvents error", boom]])
  })
})

describe("a handler that throws", () => {
  it("is reported, not allowed to escape into the poller", () => {
    const h = harness()
    const errors: Error[] = []
    watchEntityEvents(h.client, {
      onEntityCreated: () => {
        throw new Error("consumer blew up")
      },
      onError: (error) => errors.push(error),
    })

    expect(() =>
      h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })]),
    ).not.toThrow()
    expect(errors).toMatchObject([{ message: "consumer blew up" }])
  })

  it("does not stop the other handlers for the same event", () => {
    const h = harness()
    const seen: string[] = []
    watchEntityEvents(h.client, {
      onEvent: () => {
        throw new Error("onEvent blew up")
      },
      onEntityCreated: () => seen.push("onEntityCreated"),
      onError: () => {},
    })

    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])

    expect(seen).toEqual(["onEntityCreated"])
  })

  it("does not stop the rest of the batch", () => {
    const h = harness()
    const seen: Hex[] = []
    watchEntityEvents(h.client, {
      onEntityCreated: ({ entityKey }) => {
        seen.push(entityKey)
        if (entityKey === KEY_A) throw new Error("first one blew up")
      },
      onError: () => {},
    })

    h.emitLogs([
      logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n }, { logIndex: 0 }),
      logFor("EntityCreated", { entityKey: KEY_B, owner: BOB, expiresAt: 200n }, { logIndex: 1 }),
    ])

    expect(seen).toEqual([KEY_A, KEY_B])
  })

  it("cannot corrupt the expiry map, which is updated before dispatch", () => {
    const h = harness()
    const expired: EntityExpiredEvent[] = []
    watchEntityEvents(h.client, {
      onEntityCreated: () => {
        throw new Error("consumer blew up")
      },
      onEntityExpired: (event) => expired.push(event),
      onError: () => {},
    })

    h.emitBlock(HEAD)
    h.emitLogs([logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 200n })])
    h.emitBlock(200n)

    // The create was tracked despite the handler failing, so the expiry still arrives.
    expect(expired).toMatchObject([{ entityKey: KEY_A, expiresAt: 200n }])
  })
})
