import { parseAbi } from "viem"

/**
 * The events the engine emits: one per applied operation, in application order, so an off-chain
 * replica can replay a transaction operation by operation.
 */
export const ENTITY_EVENTS_ABI = parseAbi([
  "event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)",
  "event EntityPatched(bytes32 indexed entityKey, address indexed owner)",
  "event ExpiryExtended(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt)",
  "event OwnershipTransferred(bytes32 indexed entityKey, address indexed previousOwner, address indexed newOwner)",
  "event EntityDeleted(bytes32 indexed entityKey, address indexed owner)",
])

/** The name of each event in {@link ENTITY_EVENTS_ABI}. */
export type EntityEventName = (typeof ENTITY_EVENTS_ABI)[number]["name"]
