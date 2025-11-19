/**
 * @module main
 */

// Re-export all viem stuff
export * from "viem"

// export main arkiv stuff
export type { ArkivClient } from "./clients/baseClient"
export type { PublicArkivClient } from "./clients/createPublicClient"
export { createPublicClient } from "./clients/createPublicClient"
export type { WalletArkivClient } from "./clients/createWalletClient"
export { createWalletClient } from "./clients/createWalletClient"

// re-export arkiv types in main index file
export * from "./types"

// re-export chosen utils
export { chainFromName } from "./utils/chains"
export { jsonToPayload, stringToPayload } from "./utils/payload"
