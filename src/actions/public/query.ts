import { numberToHex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Entity } from "../../types/entity"
import type { RpcQueryOptions } from "../../types/rpcSchema"
import { entityFromRpcResult } from "../../utils/entities"

export type QueryOptionsIncludeData = {
  attributes?: boolean
  payload?: boolean
  metadata?: boolean
}
export type QueryOptions = {
  includeData?: QueryOptionsIncludeData
  atBlock?: bigint
  resultsPerPage?: number | undefined
  cursor?: string | undefined
}

export type QueryReturnType = {
  entities: Entity[]
  cursor: string | undefined
  blockNumber: bigint | undefined
}

export async function query(client: ArkivClient, query: string, queryOptions?: QueryOptions) {
  const rpcQueryOptions: RpcQueryOptions = {
    includeData: {
      key: true,
      payload: queryOptions?.includeData?.payload ?? true,
      attributes: queryOptions?.includeData?.attributes ?? false,
      contentType: queryOptions?.includeData?.metadata ?? false,
      expiration: queryOptions?.includeData?.metadata ?? false,
      owner: queryOptions?.includeData?.metadata ?? false,
      creator: queryOptions?.includeData?.metadata ?? false,
      createdAtBlock: queryOptions?.includeData?.metadata ?? false,
      lastModifiedAtBlock: queryOptions?.includeData?.metadata ?? false,
      transactionIndexInBlock: queryOptions?.includeData?.metadata ?? false,
      operationIndexInTransaction: queryOptions?.includeData?.metadata ?? false,
    },
    ...(queryOptions?.atBlock !== undefined && { atBlock: numberToHex(queryOptions.atBlock) }),
    ...(queryOptions?.resultsPerPage !== undefined && {
      resultsPerPage: numberToHex(queryOptions.resultsPerPage),
    }),
    ...(queryOptions?.cursor !== undefined && { cursor: queryOptions?.cursor }),
  }

  const result = await client.request({
    method: "arkiv_query",
    params: [query, rpcQueryOptions],
  })

  const entities = await Promise.all(result.data.map((entity) => entityFromRpcResult(entity)))

  return {
    entities,
    cursor: result.cursor,
    blockNumber: BigInt(result.blockNumber),
  }
}
