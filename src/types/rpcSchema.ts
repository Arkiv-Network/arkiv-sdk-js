import type { PublicRpcSchema } from "viem"

export type ArkivRpcSchema = [
	{
		Method: "golembase_getStorageValue"
		Parameters?: [entityId: string]
		ReturnType: string
	},
	{
		Method: "golembase_getEntityMetaData"
		Parameters?: [entityId: string]
		ReturnType: {
			expiresAtBlock: number
			owner: string
			numericAnnotations: [{ key: string; value: number }]
			stringAnnotations: [{ key: string; value: string }]
		}
	},
]

export type PublicArkivRpcSchema = [...PublicRpcSchema, ...ArkivRpcSchema]
