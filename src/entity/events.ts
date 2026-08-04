import { parseAbi } from "viem"

/**
 * The events the engine emits: one per applied operation, in application order, so an off-chain
 * replica can replay a transaction operation by operation.
 *
 * A purge emits **nothing** — an entity that reaches its expiry is simply gone. Apps watch the
 * indexed `$expiresAt` instead, which is what `watchEntityEvents` does on their behalf to
 * synthesize {@link EntityExpiredEvent}.
 *
 * @remarks
 * **The parameter lists are inferred.** The spec names the five events and fixes the set, but does
 * not give their signatures; these are the shapes the operations imply. That matters more than it
 * looks: an event topic is the hash of its full signature, so a wrong parameter list does not
 * mis-decode a log — it matches no log at all, and a subscription built on it goes **quiet** rather
 * than failing. Reconcile against the reference contracts (`ExecutionClient` / `ArkivEngine`) before
 * trusting silence to mean "nothing happened".
 */
export const ENTITY_EVENTS_ABI = parseAbi([
  "event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint256 expiresAt)",
  "event EntityPatched(bytes32 indexed entityKey, address indexed owner)",
  "event ExpiryExtended(bytes32 indexed entityKey, uint256 expiresAt)",
  "event OwnershipTransferred(bytes32 indexed entityKey, address indexed previousOwner, address indexed newOwner)",
  "event EntityDeleted(bytes32 indexed entityKey, address indexed owner)",
])

/** The name of each event in {@link ENTITY_EVENTS_ABI}. */
export type EntityEventName = (typeof ENTITY_EVENTS_ABI)[number]["name"]
