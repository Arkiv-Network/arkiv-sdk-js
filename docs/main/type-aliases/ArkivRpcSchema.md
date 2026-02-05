[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / ArkivRpcSchema

# Type Alias: ArkivRpcSchema

> **ArkivRpcSchema** = \[\{ `Method`: `"arkiv_query"`; `Parameters?`: \[`string`, [`RpcQueryOptions`](RpcQueryOptions.md)\]; `ReturnType`: \{ `blockNumber`: `number`; `cursor`: `string`; `data`: [`RpcEntity`](RpcEntity.md)[]; \}; \}, \{ `Method`: `"arkiv_getBlockTiming"`; `Parameters?`: \[\]; `ReturnType`: \{ `current_block`: `bigint`; `current_block_time`: `number`; `duration`: `number`; \}; \}, \{ `Method`: `"arkiv_getEntityCount"`; `Parameters?`: \[\]; `ReturnType`: `number`; \}\]

Defined in: [src/types/rpcSchema.ts:45](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/08d5204746de17cd551f756b87a4d260c4eda928/src/types/rpcSchema.ts#L45)
