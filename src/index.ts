/**
 * @module main
 */

// the advanced path: build, send, ping and read mutation results as separate minimal-RPC steps
export * from "./actions/advanced"
// the attribute type system
export * from "./attr"
// export main arkiv stuff
export type { ArkivClient } from "./clients/baseClient"
export type { PublicArkivClient } from "./clients/createPublicClient"
export { createPublicClient } from "./clients/createPublicClient"
export type { WalletArkivClient } from "./clients/createWalletClient"
export { createWalletClient } from "./clients/createWalletClient"
export type {
  PublicAdvancedActions,
  WalletAdvancedActions,
} from "./clients/decorators/arkivAdvanced"
export type { PublicArkivActions } from "./clients/decorators/arkivPublic"
export type { WalletArkivActions } from "./clients/decorators/arkivWallet"
// entity lifetimes, flags, keys and the protocol parameters behind them
export * from "./entity"
// re-export errors
export * from "./errors"
// re-export arkiv types in main index file
export * from "./types"
// the building blocks behind the advanced path, for callers that go even lower
export type { EntityMutationOps, MutationEvents } from "./utils/arkivTransactions"
export {
  buildEntityOperations,
  collectMutationEvents,
  mutationNeedsBlockNumber,
} from "./utils/arkivTransactions"
// re-export chosen utils
export { chainFromName } from "./utils/chains"
// every create needs an expiry, and this is the only way to build one
export { type DeadlineOptions, ExpirationTime } from "./utils/expirationTime"
export { jsonToPayload, stringToPayload } from "./utils/payload"
