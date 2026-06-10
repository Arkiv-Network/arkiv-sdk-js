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
  stringAttributes?: [{ key: string; value: string }]
  numericAttributes?: [{ key: string; value: Hex }]
}

export type RpcQueryOptions = {
  atBlock?: Hex
  includeData?: RpcIncludeData
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
