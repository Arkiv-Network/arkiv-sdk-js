import type { Hex, PublicRpcSchema } from "viem"

export type RpcEntity = {
	key: Hex
	value: string
	expiresAt: bigint
	owner: Hex
	stringAnnotations?: [{ key: string; value: string }]
	numericAnnotations?: [{ key: string; value: number }]
}

export type RpcQueryOptions = {
	atBlock?: number
	includeData?: RpcIncludeData
	resultsPerPage?: number
	cursor?: string
}

export type RpcIncludeData = {
	key: boolean
	annotations: boolean
	payload: boolean
	expiration: boolean
	owner: boolean
}

export type ArkivRpcSchema = [
	{
		Method: "golembase_getStorageValue"
		Parameters?: [entityId: Hex]
		ReturnType: string
	},
	{
		Method: "arkiv_query"
		Parameters?: [query: string, queryOptions?: RpcQueryOptions]
		ReturnType: {
			data: [RpcEntity]
			blockNumber: bigint
			cursor: string
		}
	},
	{
		Method: "golembase_getEntityMetaData"
		Parameters?: [entityId: Hex]
		ReturnType: {
			expiresAtBlock: number
			owner: Hex
			numericAnnotations: [{ key: string; value: number }]
			stringAnnotations: [{ key: string; value: string }]
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
