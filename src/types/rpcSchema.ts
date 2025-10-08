import type { Hex, PublicRpcSchema } from "viem"

export type ArkivRpcSchema = [
	{
		Method: "golembase_getStorageValue"
		Parameters?: [entityId: Hex]
		ReturnType: string
	},
	{
		Method: "golembase_queryEntities"
		Parameters?: [query: string]
		ReturnType: [{ key: Hex; value: string }]
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
]

export type PublicArkivRpcSchema = [...PublicRpcSchema, ...ArkivRpcSchema]
