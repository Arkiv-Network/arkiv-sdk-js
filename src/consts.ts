//export const ARKIV_ADDRESS = "0x00000000000000000000000000000061726b6976" as `0x${string}`
export const ARKIV_ADDRESS = "0x4400000000000000000000000000000000000044" as `0x${string}`
export const BLOCK_TIME = 2 // 2 seconds
/**
 * The longest an entity may live, in blocks, counted from the block its create or extension lands
 * in: 7,884,000 blocks, about 182.5 days at {@link BLOCK_TIME}. The chain reverts anything longer
 * with `ExpiryBeyondMaxLifetime`, so the SDK refuses it before sending.
 */
export const MAX_LIFETIME = 7_884_000n
/** Where to get a free access key for the RPC endpoints Arkiv hosts. */
export const ACCESS_KEYS_URL = "https://hub.arkiv.network/access-keys"
