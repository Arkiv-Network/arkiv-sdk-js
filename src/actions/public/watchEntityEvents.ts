import { decodeEventLog, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { PublicArkivClient } from "../../clients/createPublicClient"
import { ARKIV_ADDRESS, BLOCK_TIME } from "../../consts"
import { ENTITY_EVENTS_ABI } from "../../entity/events"
import { decodeCreationFlags } from "../../entity/flags"
import type {
  EntityCreatedEvent,
  EntityDeletedEvent,
  EntityEvent,
  EntityEventContext,
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
   * Every event, in application order, whatever its type. Runs *before* the per-event handler for
   * the same event.
   *
   * This is the replay seam: operations apply in batch order and emit one event each, so an
   * off-chain replica that consumes this in order sees exactly what the engine did.
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

/**
 * Watches entity events, calling the handlers you pass as they arrive.
 *
 * Every event here is decoded from a log the Arkiv operation address emitted, and carries the
 * block, transaction and log index it came from — so consuming them in order replays exactly what
 * the engine did.
 *
 * @param parameters - Handlers and options. {@link WatchEntityEventsParameters}
 * @returns A function that stops the watcher.
 *
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { tiramisu } from "@arkiv-network/sdk/chains"
 * import { http } from "viem"
 *
 * const client = createPublicClient({ chain: tiramisu, transport: http() })
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
    onEvent,
    onError,
    fromBlock,
    pollingInterval = DEFAULT_POLLING_INTERVAL,
  } = parameters

  const publicClient = client as PublicArkivClient
  const reportError = onError ?? logToConsole

  function emit(event: EntityEvent): void {
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

  return unwatchLogs
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
      return {
        type: "EntityCreated",
        ...context,
        ...decoded.args,
        creationFlags: decodeCreationFlags(decoded.args.creationFlags),
      }
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
