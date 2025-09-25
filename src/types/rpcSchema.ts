import type { PublicRpcSchema } from "viem";

export type ArkivRpcSchema = [
	{
		Method: "golembase_getStorageValue";
		Parameters?: [entityId: string];
		ReturnType: string;
	},
];

export type PublicArkivRpcSchema = [...PublicRpcSchema, ...ArkivRpcSchema];
