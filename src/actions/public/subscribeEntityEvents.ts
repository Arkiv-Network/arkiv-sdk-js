import { decodeEventLog, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { PublicArkivClient } from "../../clients/createPublicClient"
import { EntityOperationType } from "../../types/entity"
import type {
  OnEntityCreatedEvent,
  OnEntityDeletedEvent,
  OnEntityExpiredEvent,
  OnEntityExpiresInExtendedEvent,
  OnEntityOwnerChangedEvent,
  OnEntityUpdatedEvent,
} from "../../types/events"
import { ENTITY_OPERATION_EVENT_ABI } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:public:subscribe-entity-events")

export const arkivABI = ENTITY_OPERATION_EVENT_ABI

export async function subscribeEntityEvents(
  client: ArkivClient,
  {
    onError,
    onEntityCreated,
    onEntityUpdated,
    onEntityDeleted,
    onEntityExpired,
    onEntityExpiresInExtended,
    onEntityOwnerChanged,
  }: {
    onError: ((error: Error) => void) | undefined
    onEntityCreated?: ((event: OnEntityCreatedEvent) => void) | undefined
    onEntityUpdated?: ((event: OnEntityUpdatedEvent) => void) | undefined
    onEntityDeleted?: ((event: OnEntityDeletedEvent) => void) | undefined
    onEntityExpired?: ((event: OnEntityExpiredEvent) => void) | undefined
    onEntityExpiresInExtended?: ((event: OnEntityExpiresInExtendedEvent) => void) | undefined
    onEntityOwnerChanged?: ((event: OnEntityOwnerChangedEvent) => void) | undefined
  },
  pollingInterval?: number,
  fromBlock?: bigint,
): Promise<() => void> {
  const unsubscribe = (client as PublicArkivClient).watchEvent({
    pollingInterval: pollingInterval ?? 1000,
    fromBlock,
    events: arkivABI,
    onLogs: (logs) => {
      logger("logs from subscribeEntityEvents %o", logs)
      for (const log of logs) {
        const event = decodeEventLog({
          abi: arkivABI,
          topics: log.topics as [Hex, ...Hex[]] | [],
          data: log.data,
        })
        logger("event from subscribeEntityEvents %o", event)

        if (event.eventName !== "EntityOperation") continue

        const entityKey = event.args.entityKey as Hex
        const owner = event.args.owner
        const expiresAt = event.args.expiresAt
        const entityHash = event.args.entityHash as Hex
        const opType = Number(event.args.operationType)

        switch (opType) {
          case EntityOperationType.Create:
            onEntityCreated?.({ entityKey, owner, expiresAt, entityHash })
            break
          case EntityOperationType.Update:
            onEntityUpdated?.({ entityKey, owner, expiresAt, entityHash })
            break
          case EntityOperationType.Extend:
            onEntityExpiresInExtended?.({ entityKey, owner, expiresAt, entityHash })
            break
          case EntityOperationType.Transfer:
            onEntityOwnerChanged?.({ entityKey, owner, entityHash })
            break
          case EntityOperationType.Delete:
            onEntityDeleted?.({ entityKey, owner })
            break
          default:
            onEntityExpired?.({ entityKey, owner })
            break
        }
      }
    },
    onError: (error) => {
      console.error("error from subscribeEntityEvents", error)
      onError?.(error)
    },
  })

  return unsubscribe
}
