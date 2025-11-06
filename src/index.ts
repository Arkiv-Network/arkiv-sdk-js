// Re-export commonly used viem types for convenience
export type {
  Account,
  Address,
  Chain,
  Hex,
  PublicClientConfig,
  RpcSchema,
  Transport,
} from "viem"

export { http, toBytes, toHex, toRlp, webSocket } from "viem"

// export main arkiv stuff
export type { ArkivClient } from "./clients/baseClient"
export type { PublicArkivClient } from "./clients/createPublicClient"
export { createPublicClient } from "./clients/createPublicClient"
export type { WalletArkivClient } from "./clients/createWalletClient"
export { createWalletClient } from "./clients/createWalletClient"

// re-export arkiv types in main index file
export type {
  ArkivRpcSchema,
  Attribute,
  ChangeOwnershipParameters,
  ChangeOwnershipReturnType,
  CreateEntityParameters,
  CreateEntityReturnType,
  DeleteEntityParameters,
  DeleteEntityReturnType,
  Entity,
  ExtendEntityParameters,
  ExtendEntityReturnType,
  MimeType,
  MutateEntitiesParameters,
  MutateEntitiesReturnType,
  RpcEntity,
  RpcIncludeData,
  RpcQueryOptions,
  TxParams,
  UpdateEntityParameters,
  UpdateEntityReturnType,
} from "./types"
