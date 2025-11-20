import type { Hex, PublicRpcSchema } from "viem"
import type { MimeType } from "./mimeTypes"

export type RpcEntity = {
  key: Hex
  contentType: MimeType
  value: string
  expiresAt: string
  createdAtBlock: string
  lastModifiedAtBlock: string
  transactionIndexInBlock: string
  operationIndexInTransaction: string
  owner: Hex
  stringAttributes?: [{ key: string; value: string }]
  numericAttributes?: [{ key: string; value: number }]
}

export type RpcOrderByAttribute = {
  name: string
  type: "string" | "numeric"
  desc: boolean
}

export type RpcQueryOptions = {
  atBlock?: number
  includeData?: RpcIncludeData
  orderBy?: RpcOrderByAttribute[]
  resultsPerPage?: number
  cursor?: string
}

export type RpcIncludeData = {
  key?: boolean
  attributes?: boolean
  payload?: boolean
  contentType?: boolean
  expiration?: boolean
  owner?: boolean
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
      blockNumber: bigint
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
