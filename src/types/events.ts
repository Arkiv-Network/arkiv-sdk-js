import type { Hex } from "viem"

export type OnEntityCreatedEvent = {
	entityKey: Hex
	owner: Hex
	expirationBlock: number
	cost: bigint
}

export type OnEntityUpdatedEvent = {
	entityKey: Hex
	owner: Hex
	oldExpirationBlock: number
	newExpirationBlock: number
	cost: bigint
}

export type OnEntityDeletedEvent = {
	entityKey: Hex
	owner: Hex
}

export type OnEntityExpiredEvent = {
	entityKey: Hex
	owner: Hex
}

export type OnEntityExpiresInExtendedEvent = {
	entityKey: Hex
	owner: Hex
	oldExpirationBlock: number
	newExpirationBlock: number
	cost: bigint
}
