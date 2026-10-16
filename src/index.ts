/**
 * @module main
 */

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
  AttributeRef,
  DynamicSelection,
  Expression,
  FromOptions,
  FullEntity,
  FullRow,
  NonEmptySelection,
  PartialRow,
  QueryResult,
  ResultOf,
  Row,
  SchemaRef,
  SelectArg,
  Selected,
  Selection,
  SelectionOf,
} from "./query"
export { SelectQueryBuilder } from "./query"
// schemas and the attribute type system
export * from "./schema"
// re-export arkiv types in main index file
export * from "./types"
// re-export chosen utils
export { chainFromName } from "./utils/chains"
// every create needs an expiry, and this is the only way to build one
export { type DeadlineOptions, ExpirationTime } from "./utils/expirationTime"
