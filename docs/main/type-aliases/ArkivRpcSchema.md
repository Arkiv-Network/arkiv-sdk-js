[**@arkiv-network/sdk v0.6.1**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / ArkivRpcSchema

# Type Alias: ArkivRpcSchema

> **ArkivRpcSchema** = \[\{ `Method`: `"arkiv_query"`; `Parameters?`: \[`string`, [`RpcQueryOptions`](RpcQueryOptions.md)\]; `ReturnType`: \{ `blockNumber`: `bigint`; `cursor`: `string`; `data`: [`RpcEntity`](RpcEntity.md)[]; \}; \}, \{ `Method`: `"arkiv_getBlockTiming"`; `Parameters?`: \[\]; `ReturnType`: \{ `current_block`: `bigint`; `current_block_time`: `number`; `duration`: `number`; \}; \}, \{ `Method`: `"arkiv_getEntityCount"`; `Parameters?`: \[\]; `ReturnType`: `number`; \}\]

Defined in: [src/types/rpcSchema.ts:45](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/c260e07488c8d139ede2633208b0eec1ee0b9713/src/types/rpcSchema.ts#L45)
