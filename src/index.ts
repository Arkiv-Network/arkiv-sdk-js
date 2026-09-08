/**
 * @module main
 */

// the attribute type system
export * from "./attr"
// export main arkiv stuff
export type { ArkivClient } from "./clients/baseClient"
export type { PublicArkivClient } from "./clients/createPublicClient"
export { createPublicClient } from "./clients/createPublicClient"
export type { WalletArkivClient } from "./clients/createWalletClient"
export { createWalletClient } from "./clients/createWalletClient"
export type { PublicArkivActions } from "./clients/decorators/arkivPublic"
export type { WalletArkivActions } from "./clients/decorators/arkivWallet"
// entity lifetimes, flags, keys and the protocol parameters behind them
export * from "./entity"
// re-export errors
export * from "./errors"
// types referenced by the public client, must be reachable from the package root
// see #106
export type {
  EntitySelection,
  Expression,
  FullEntity,
  ProjectedEntity,
  QueryResult,
  SelectArg,
} from "./query"
export { SelectQueryBuilder } from "./query"
// re-export arkiv types in main index file
export * from "./types"
// re-export chosen utils
export { chainFromName } from "./utils/chains"
// every create needs an expiry, and this is the only way to build one
export { type DeadlineOptions, ExpirationTime } from "./utils/expirationTime"
export { jsonToPayload, stringToPayload } from "./utils/payload"
