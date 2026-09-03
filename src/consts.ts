/**
 * Address of the precompile registry contract.
 * This address is used for:
 * - Mutating entities by sending an entity mutation transaction (CALL) to this address.
 * - Reading an entity nonce (used to predict future entity keys prior to creation).
 * - Filtering/subscribing to entity events emitted from this address.
 */
export const ARKIV_ADDRESS = "0x4400000000000000000000000000000000000044" as `0x${string}`
export const BLOCK_TIME = 2 // 2 seconds
