import type { Address, Hex } from "viem"

/**
 * Where an event sits in the chain — carried by every on-chain entity event.
 *
 * Operations apply in batch order and emit one event each, so `blockNumber` and `logIndex` together
 * are the order the operations were applied in. A replica that replays them in that order sees
 * exactly what the engine did.
 */
export type EntityEventContext = {
  /** The block the operation was applied in. */
  blockNumber: bigint
  /** The transaction the operation was part of. */
  transactionHash: Hex
  /** The event's position within its block. */
  logIndex: number
}

/** An entity was created. */
export type EntityCreatedEvent = EntityEventContext & {
  type: "EntityCreated"
  entityKey: Hex
  owner: Address
  /** The block the entity is set to expire at. */
  expiresAt: bigint
}

/**
 * An entity's attributes or payload changed.
 *
 * The event says *that* it changed, not what to — read the entity to see the new state.
 */
export type EntityPatchedEvent = EntityEventContext & {
  type: "EntityPatched"
  entityKey: Hex
  owner: Address
}

/** An entity's expiry moved further out. */
export type ExpiryExtendedEvent = EntityEventContext & {
  type: "ExpiryExtended"
  entityKey: Hex
  /** The block the entity is now set to expire at. */
  expiresAt: bigint
}

/** An entity changed hands. */
export type OwnershipTransferredEvent = EntityEventContext & {
  type: "OwnershipTransferred"
  entityKey: Hex
  previousOwner: Address
  newOwner: Address
}

/** An entity was deleted by its owner, before its expiry. */
export type EntityDeletedEvent = EntityEventContext & {
  type: "EntityDeleted"
  entityKey: Hex
  owner: Address
}

/**
 * Every event the engine emits, discriminated by `type`.
 *
 * This is the on-chain set only. {@link EntityExpiredEvent} is not part of it: an expiry emits no
 * log, so it has no place in a replay of what the chain did.
 */
export type EntityEvent =
  | EntityCreatedEvent
  | EntityPatchedEvent
  | ExpiryExtendedEvent
  | OwnershipTransferredEvent
  | EntityDeletedEvent

/**
 * An entity reached its expiry — **synthesized by the SDK**, not emitted by the chain.
 *
 * A purge is not an operation and produces no log, so there is nothing to decode. What the SDK has
 * instead is the `expiresAt` it saw on the entity's create or extension, and the block height as it
 * advances; when the height reaches that block, the entity is gone.
 *
 * There is no transaction or log index here because there is no transaction or log.
 */
export type EntityExpiredEvent = {
  type: "EntityExpired"
  entityKey: Hex
  /** The block the entity was set to expire at. */
  expiresAt: bigint
  /** The first block at or after `expiresAt` that the watcher observed. */
  observedAtBlock: bigint
}
