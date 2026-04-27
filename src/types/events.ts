import type { Address, Hex } from "viem"

export type OnEntityCreatedEvent = {
  entityKey: Hex
  owner: Address
  expiresAt: number
  entityHash: Hex
}

export type OnEntityUpdatedEvent = {
  entityKey: Hex
  owner: Address
  expiresAt: number
  entityHash: Hex
}

export type OnEntityDeletedEvent = {
  entityKey: Hex
  owner: Address
}

export type OnEntityExpiredEvent = {
  entityKey: Hex
  owner: Address
}

export type OnEntityExpiresInExtendedEvent = {
  entityKey: Hex
  owner: Address
  expiresAt: number
  entityHash: Hex
}

export type OnEntityOwnerChangedEvent = {
  entityKey: Hex
  owner: Address
  entityHash: Hex
}
