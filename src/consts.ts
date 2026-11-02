//export const ARKIV_ADDRESS = "0x00000000000000000000000000000061726b6976" as `0x${string}`
export const ARKIV_ADDRESS = "0x4400000000000000000000000000000000000044" as `0x${string}`
export const BLOCK_TIME = 2 // 2 seconds
/** Where to get a free access key for the RPC endpoints Arkiv hosts. */
export const ACCESS_KEYS_URL = "https://hub.arkiv.network/access-keys"

/**
 * Headroom added to a gas estimate, in percent.
 */
export const GAS_HEADROOM_PERCENT = 25n

/**
 * The most gas one transaction may carry: EIP-7825's per-transaction cap, which the node enforces.
 */
export const MAX_TRANSACTION_GAS = 2n ** 24n
