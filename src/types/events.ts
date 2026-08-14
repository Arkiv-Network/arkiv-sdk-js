import type { Address, Hex } from "viem"
import type { ResolvedCreationFlags } from "../entity/flags"

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
  /**
   * The immutable properties the entity was created with, decoded from its `creationFlags` byte.
   */
  creationFlags: ResolvedCreationFlags
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
  /**
   * The entity's owner — **not** whoever extended it. An entity created with
   * `permissionlessExtension` can be extended by anyone, and the event does not say by whom; read
   * the transaction's sender if you need that.
   */
  owner: Address
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
 */
export type EntityEvent =
  | EntityCreatedEvent
  | EntityPatchedEvent
  | ExpiryExtendedEvent
  | OwnershipTransferredEvent
  | EntityDeletedEvent
