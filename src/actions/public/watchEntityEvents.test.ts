import { describe, expect, it } from "bun:test"
import { type Abi, encodeAbiParameters, encodeEventTopics, getAbiItem, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { ARKIV_ADDRESS } from "../../consts"
import { ENTITY_EVENTS_ABI, type EntityEventName } from "../../entity/events"
import type { EntityEvent } from "../../types/events"
import { watchEntityEvents } from "./watchEntityEvents"

const KEY_A = `0x${"aa".repeat(32)}` as Hex
const KEY_B = `0x${"bb".repeat(32)}` as Hex
const ALICE = "0x1111111111111111111111111111111111111111" as const
const BOB = "0x2222222222222222222222222222222222222222" as const

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
  /** Raises a transport error on the log watcher. */
  failLogs: (error: Error) => void
  watchEventCalls: Record<string, unknown>[]
  stops: string[]
}

/** A client that hands back its watcher callbacks so a test can drive them directly. */
function harness(): Harness {
  const state: Partial<{
    onLogs: (logs: Log[]) => void
    onLogsError: (error: Error) => void
  }> = {}
  const watchEventCalls: Record<string, unknown>[] = []
  const stops: string[] = []

  const client = {
    // biome-ignore lint/suspicious/noExplicitAny: a stand-in for viem's generic watcher.
    watchEvent(parameters: any) {
      watchEventCalls.push(parameters)
      state.onLogs = parameters.onLogs
      state.onLogsError = parameters.onError
      return () => stops.push("logs")
    },
  } as unknown as ArkivClient

  return {
    client,
    emitLogs: (logs) => state.onLogs?.(logs),
    failLogs: (error) => state.onLogsError?.(error),
    watchEventCalls,
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
        { entityKey: KEY_A, owner: ALICE, expiresAt: 1_200_000n, creationFlags: 0b11 },
        { blockNumber: 42n, logIndex: 3 },
      ),
    ])

    expect(seen).toEqual([
      {
        type: "EntityCreated",
        entityKey: KEY_A,
        owner: ALICE,
        expiresAt: 1_200_000n,
        // Decoded, with the byte kept alongside so a flag this SDK has no name for stays visible.
        creationFlags: { readonly: true, permissionlessExtension: true, raw: 0b11 },
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

    h.emitLogs([logFor("ExpiryExtended", { entityKey: KEY_A, owner: ALICE, expiresAt: 999n })])

    // `owner` is the entity's owner, not the caller — a permissionless extension is by a non-owner.
    expect(seen).toMatchObject([
      { type: "ExpiryExtended", entityKey: KEY_A, owner: ALICE, expiresAt: 999n },
    ])
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
      logFor(
        "EntityCreated",
        { entityKey: KEY_A, owner: ALICE, expiresAt: 500n, creationFlags: 0 },
        { logIndex: 0 },
      ),
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

    h.emitLogs([
      logFor("EntityCreated", { entityKey: KEY_A, owner: ALICE, expiresAt: 1n, creationFlags: 0 }),
    ])

    expect(order).toEqual(["onEvent", "onEntityCreated"])
  })
})

describe("the watcher itself", () => {
  it("only listens to the Arkiv operation address", () => {
    const h = harness()
    watchEntityEvents(h.client, { onEntityCreated: () => {} })

    expect(h.watchEventCalls[0]).toMatchObject({ address: ARKIV_ADDRESS })
  })

  it("polls twice a block by default", () => {
    const h = harness()
    watchEntityEvents(h.client, { onEntityCreated: () => {} })

    // Blocks are 2s, so a default that leaves an event a whole block stale is too slow.
    expect(h.watchEventCalls[0]).toMatchObject({ pollingInterval: 1000 })
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

  it("stops the watcher when unwatched", () => {
    const h = harness()
    const unwatch = watchEntityEvents(h.client, { onEntityCreated: () => {} })

    expect(h.stops).toEqual([])
    unwatch()
    expect(h.stops).toEqual(["logs"])
  })

  it("skips a log with no position rather than inventing one", () => {
    const h = harness()
    const seen: EntityEvent[] = []
    watchEntityEvents(h.client, { onEvent: (event) => seen.push(event) })

    const log = logFor("EntityCreated", {
      entityKey: KEY_A,
      owner: ALICE,
      expiresAt: 1n,
      creationFlags: 0,
    })
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
      ...logFor("EntityCreated", {
        entityKey: KEY_A,
        owner: ALICE,
        expiresAt: 1n,
        creationFlags: 0,
      }),
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
      h.emitLogs([
        logFor("EntityCreated", {
          entityKey: KEY_A,
          owner: ALICE,
          expiresAt: 200n,
          creationFlags: 0,
        }),
      ]),
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

    h.emitLogs([
      logFor("EntityCreated", {
        entityKey: KEY_A,
        owner: ALICE,
        expiresAt: 200n,
        creationFlags: 0,
      }),
    ])

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
      logFor(
        "EntityCreated",
        { entityKey: KEY_A, owner: ALICE, expiresAt: 200n, creationFlags: 0 },
        { logIndex: 0 },
      ),
      logFor(
        "EntityCreated",
        { entityKey: KEY_B, owner: BOB, expiresAt: 200n, creationFlags: 0 },
        { logIndex: 1 },
      ),
    ])

    expect(seen).toEqual([KEY_A, KEY_B])
  })
})
