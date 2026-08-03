import type { Hex, PublicRpcSchema } from "viem"
import type { MimeType } from "./mimeTypes"

export type RpcEntity = {
  key: Hex
  contentType: MimeType
  value: string
  expiresAt: Hex
  createdAtBlock: Hex
  lastModifiedAtBlock: Hex
  transactionIndexInBlock: Hex
  operationIndexInTransaction: Hex
  owner: Hex
  creator: Hex
  attributes?: { key: string; value: string; valueType: RpcAttributeValueType }[]
}

export enum RpcAttributeValueType {
  Uint = 1,
  String = 2,
  EntityKey = 3,
}

export type RpcOrderByAttribute = {
  name: string
  type: "string" | "numeric"
  desc: boolean
}

export type RpcQueryOptions = {
  atBlock?: Hex
  includeData?: RpcIncludeData
  orderBy?: RpcOrderByAttribute[]
  resultsPerPage?: Hex
  cursor?: string
}

export type RpcIncludeData = {
  key?: boolean
  attributes?: boolean
  payload?: boolean
  contentType?: boolean
  expiration?: boolean
  owner?: boolean
  creator?: boolean
  createdAtBlock?: boolean
  lastModifiedAtBlock?: boolean
  transactionIndexInBlock?: boolean
  operationIndexInTransaction?: boolean
}

export type ArkivRpcSchema = [
  {
    Method: "arkiv_query"
    Parameters?: [query: string, queryOptions?: RpcQueryOptions]
    ReturnType: {
      data: RpcEntity[]
      blockNumber: Hex
      cursor: string
    }
  },
  {
    Method: "arkiv_getBlockTiming"
    Parameters?: []
    ReturnType: {
      current_block: bigint
      current_block_time: number
      duration: number
    }
  },
  {
    Method: "arkiv_getEntityCount"
    Parameters?: []
    ReturnType: number
  },
]

export type PublicArkivRpcSchema = [...PublicRpcSchema, ...ArkivRpcSchema]
