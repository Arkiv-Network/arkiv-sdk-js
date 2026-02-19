[**@arkiv-network/sdk v0.6.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / ArkivRpcSchema

# Type Alias: ArkivRpcSchema

> **ArkivRpcSchema** = \[\{ `Method`: `"arkiv_query"`; `Parameters?`: \[`string`, [`RpcQueryOptions`](RpcQueryOptions.md)\]; `ReturnType`: \{ `blockNumber`: `bigint`; `cursor`: `string`; `data`: [`RpcEntity`](RpcEntity.md)[]; \}; \}, \{ `Method`: `"arkiv_getBlockTiming"`; `Parameters?`: \[\]; `ReturnType`: \{ `current_block`: `bigint`; `current_block_time`: `number`; `duration`: `number`; \}; \}, \{ `Method`: `"arkiv_getEntityCount"`; `Parameters?`: \[\]; `ReturnType`: `number`; \}\]

Defined in: [src/types/rpcSchema.ts:45](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/2ea409e4a615ac295234b8ab33be508f9a65f324/src/types/rpcSchema.ts#L45)
