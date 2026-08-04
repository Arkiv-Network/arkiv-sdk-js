import { decodeEventLog, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { PublicArkivClient } from "../../clients/createPublicClient"
import { ARKIV_ADDRESS, BLOCK_TIME } from "../../consts"
import { ENTITY_EVENTS_ABI } from "../../entity/events"
import type {
  EntityCreatedEvent,
  EntityDeletedEvent,
  EntityEvent,
  EntityEventContext,
  EntityExpiredEvent,
  EntityPatchedEvent,
  ExpiryExtendedEvent,
  OwnershipTransferredEvent,
} from "../../types/events"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:public:watch-entity-events")

/**
 * How often to poll, when the caller does not say.
 *
 * Half a block: fast enough that an event is never a whole block stale, slow enough not to hammer
 * the node. viem's own default is derived from a 12-second Ethereum block and is far too slow here.
 */
const DEFAULT_POLLING_INTERVAL = (BLOCK_TIME * 1000) / 2

/**
 * Handlers and options for `client.watchEntityEvents`. Every handler is optional; the watcher does
 * the work for the ones you pass.
 */
export type WatchEntityEventsParameters = {
  onEntityCreated?: ((event: EntityCreatedEvent) => void) | undefined
  onEntityPatched?: ((event: EntityPatchedEvent) => void) | undefined
  onExpiryExtended?: ((event: ExpiryExtendedEvent) => void) | undefined
  onOwnershipTransferred?: ((event: OwnershipTransferredEvent) => void) | undefined
  onEntityDeleted?: ((event: EntityDeletedEvent) => void) | undefined
  /**
   * An entity reached its expiry. Synthesized rather than decoded — see {@link EntityExpiredEvent}.
   *
   * It covers only entities created or extended **while this watcher was running**. Replayed
   * history is deliberately excluded: a create from before you started watching may since have been
   * extended, deleted or already purged, and the watcher cannot tell which from the log alone. To
   * cover entities that already exist, query `$expiresAt` for them instead.
   */
  onEntityExpired?: ((event: EntityExpiredEvent) => void) | undefined
  /**
   * Every on-chain event, in application order, whatever its type. Runs *before* the per-event
   * handler for the same event.
   *
   * This is the replay seam: operations apply in batch order and emit one event each, so an
   * off-chain replica that consumes this in order sees exactly what the engine did. Synthesized
   * expiries are not included — they are not operations.
   */
  onEvent?: ((event: EntityEvent) => void) | undefined
  /**
   * Transport failures, logs that will not decode, and anything one of your own handlers throws.
   *
   * Defaults to `console.error`. A watcher whose filter the node dropped otherwise just goes quiet,
   * and a quiet watcher is indistinguishable from a quiet chain.
   */
  onError?: ((error: Error) => void) | undefined
  /** Replay from this block before following the head. Defaults to the head. */
  fromBlock?: bigint | undefined
  /** How often to poll, in milliseconds. Defaults to half a block. */
  pollingInterval?: number | undefined
}

/** What the watcher remembers about an entity it may have to announce the expiry of. */
type TrackedExpiry = {
  /** The block the entity is set to expire at. */
  expiresAt: bigint
  /** The block whose log taught us that — how a replayed create is told from a live one. */
  learnedAtBlock: bigint
}

/**
 * Watches entity events, calling the handlers you pass as they arrive.
 *
 * The five on-chain events are decoded from logs emitted by the Arkiv operation address. The sixth,
 * {@link EntityExpiredEvent}, is **synthesized**: a purge emits no log, so the watcher tracks the
 * `expiresAt` it sees on creates and extensions and fires when the block height reaches one.
 *
 * @param parameters - Handlers and options. {@link WatchEntityEventsParameters}
 * @returns A function that stops the watcher.
 *
 * @remarks
 * Two limits worth knowing before you rely on `onEntityExpired`:
 *
 * - It only covers entities created or extended **while the watcher was running**. Events replayed
 *   from `fromBlock` are dispatched to the other handlers as normal, but are not tracked for
 *   expiry: their `expiresAt` may have been superseded long ago by an extension the watcher has not
 *   replayed yet, and announcing an expiry for a live entity is worse than announcing none.
 * - The tracking map holds one entry per live, unexpired entity the watcher has seen, so a
 *   long-running watcher on a busy chain holds a proportionally large map until those expiries pass.
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { braga } from "@arkiv-network/sdk/chains"
 * import { http } from "viem"
 *
 * const client = createPublicClient({ chain: braga, transport: http() })
 *
 * const unwatch = client.watchEntityEvents({
 *   onEntityCreated: ({ entityKey, owner, expiresAt }) =>
 *     console.log("created", entityKey, "by", owner, "until block", expiresAt),
 *   onEntityDeleted: ({ entityKey }) => console.log("deleted", entityKey),
 *   onError: (error) => console.error(error),
 * })
 *
 * unwatch()
 */
export function watchEntityEvents(
  client: ArkivClient,
  parameters: WatchEntityEventsParameters,
): () => void {
  const {
    onEntityCreated,
    onEntityPatched,
    onExpiryExtended,
    onOwnershipTransferred,
    onEntityDeleted,
    onEntityExpired,
    onEvent,
    onError,
    fromBlock,
    pollingInterval = DEFAULT_POLLING_INTERVAL,
  } = parameters

  const publicClient = client as PublicArkivClient
  const reportError = onError ?? logToConsole

  /**
   * The expiry of every entity this watcher has seen created or extended and not yet seen expire.
   * Only maintained when someone is listening — an unused watcher should not grow a map.
   */
  const expiries = onEntityExpired ? new Map<Hex, TrackedExpiry>() : undefined

  /**
   * The head when this watcher started, learned from the block watcher's first tick. Everything at
   * or below it is history being replayed, whose expiries are not this watcher's to announce.
   */
  let headAtStart: bigint | undefined

  function emit(event: EntityEvent): void {
    // Bookkeeping happens before dispatch and outside every handler's reach: a consumer that throws
    // must not be able to leave the expiry map disagreeing with the events it was built from.
    if (expiries !== undefined) {
      switch (event.type) {
        case "EntityCreated":
        case "ExpiryExtended":
          // An extension replaces the deadline, so this is a `set` even for an entity whose creation
          // the watcher missed: the new expiry is knowledge it did not have a moment ago.
          expiries.set(event.entityKey, {
            expiresAt: event.expiresAt,
            learnedAtBlock: event.blockNumber,
          })
          break
        case "EntityDeleted":
          // Deleted before its expiry, so the expiry it was carrying will never arrive.
          expiries.delete(event.entityKey)
          break
      }
    }

    deliver(onEvent, event)
    switch (event.type) {
      case "EntityCreated":
        deliver(onEntityCreated, event)
        break
      case "EntityPatched":
        deliver(onEntityPatched, event)
        break
      case "ExpiryExtended":
        deliver(onExpiryExtended, event)
        break
      case "OwnershipTransferred":
        deliver(onOwnershipTransferred, event)
        break
      case "EntityDeleted":
        deliver(onEntityDeleted, event)
        break
    }
  }

  /**
   * Runs one handler, keeping its failure to itself.
   *
   * A handler that throws is the consumer's problem, not the watcher's: letting it escape would
   * reject the poll, drop the rest of the batch, and take down every other handler with it.
   */
  function deliver<TEvent>(handler: ((event: TEvent) => void) | undefined, event: TEvent): void {
    if (handler === undefined) return
    try {
      handler(event)
    } catch (error) {
      reportError(asError(error))
    }
  }

  const unwatchLogs = publicClient.watchEvent({
    // Only the Arkiv operation address emits these. Without the filter any contract whose event
    // happens to hash to the same topic lands in `onLogs`, and viem's observer key — which covers
    // the address but not `events` — would make this subscription collide with any other
    // unaddressed `watchEvent` on the same client.
    address: ARKIV_ADDRESS,
    events: ENTITY_EVENTS_ABI,
    pollingInterval,
    ...(fromBlock !== undefined && { fromBlock }),
    onLogs: (logs) => {
      logger("logs %o", logs)
      for (const log of logs) {
        // A log with no position cannot be placed in application order, which is the one thing an
        // event consumer needs from it. Dropping it beats inventing a position it never had.
        if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
          continue
        }
        const context: EntityEventContext = {
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        }

        // Only the decode is guarded here. Dispatch guards each handler separately, so a consumer's
        // exception is never reported as if the log were the thing that was malformed.
        let event: EntityEvent
        try {
          event = toEntityEvent(log.topics, log.data, context)
        } catch (error) {
          reportError(asError(error))
          continue
        }
        emit(event)
      }
    },
    onError: (error) => reportError(error),
  })

  // Expiry is a block height passing, not something that happens, so it needs its own clock. Only
  // started when someone is listening — otherwise it is a poller doing nothing.
  const unwatchBlocks = onEntityExpired
    ? publicClient.watchBlockNumber({
        emitOnBegin: true,
        pollingInterval,
        onBlockNumber: (blockNumber) => {
          if (expiries === undefined) return
          if (headAtStart === undefined) {
            // The first tick establishes where "now" was when the watcher started; it sweeps
            // nothing, because at this point every entry can only have come from replayed history.
            headAtStart = blockNumber
            return
          }
          // Deleting the current entry during iteration is well-defined for a Map, and every entry
          // fires at most once because it is removed as it does.
          for (const [entityKey, tracked] of expiries) {
            if (tracked.learnedAtBlock <= headAtStart) {
              // Replayed history. The log stream may not have reached the extension that moved this
              // entity's expiry out, so the deadline on record is not evidence of anything yet.
              expiries.delete(entityKey)
              continue
            }
            if (tracked.expiresAt > blockNumber) continue
            expiries.delete(entityKey)
            onEntityExpired({
              type: "EntityExpired",
              entityKey,
              expiresAt: tracked.expiresAt,
              observedAtBlock: blockNumber,
            })
          }
        },
        onError: (error) => reportError(error),
      })
    : undefined

  return () => {
    unwatchLogs()
    unwatchBlocks?.()
    expiries?.clear()
  }
}

/** The fallback when no `onError` was given — see {@link WatchEntityEventsParameters.onError}. */
function logToConsole(error: Error): void {
  console.error("watchEntityEvents error", error)
}

/** Handlers take an `Error`, and a `throw` can be anything. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Decodes one log into the {@link EntityEvent} it carries.
 *
 * @throws If the log does not decode against {@link ENTITY_EVENTS_ABI}.
 */
function toEntityEvent(
  topics: readonly Hex[],
  data: Hex,
  context: EntityEventContext,
): EntityEvent {
  const decoded = decodeEventLog({
    abi: ENTITY_EVENTS_ABI,
    topics: topics as [Hex, ...Hex[]] | [],
    data,
  })

  switch (decoded.eventName) {
    case "EntityCreated":
      return { type: "EntityCreated", ...context, ...decoded.args }
    case "EntityPatched":
      return { type: "EntityPatched", ...context, ...decoded.args }
    case "ExpiryExtended":
      return { type: "ExpiryExtended", ...context, ...decoded.args }
    case "OwnershipTransferred":
      return { type: "OwnershipTransferred", ...context, ...decoded.args }
    case "EntityDeleted":
      return { type: "EntityDeleted", ...context, ...decoded.args }
  }
}
