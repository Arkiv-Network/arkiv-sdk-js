[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [types/rpcSchema](../index.md) / ArkivRpcSchema

# Type Alias: ArkivRpcSchema

> **ArkivRpcSchema** = \[\{ `Method`: `"arkiv_query"`; `Parameters?`: \[`string`, [`RpcQueryOptions`](RpcQueryOptions.md)\]; `ReturnType`: \{ `blockNumber`: `bigint`; `cursor`: `string`; `data`: [`RpcEntity`](RpcEntity.md)[]; \}; \}, \{ `Method`: `"arkiv_getBlockTiming"`; `Parameters?`: \[\]; `ReturnType`: \{ `current_block`: `bigint`; `current_block_time`: `number`; `duration`: `number`; \}; \}, \{ `Method`: `"arkiv_getEntityCount"`; `Parameters?`: \[\]; `ReturnType`: `number`; \}\]

Defined in: [src/types/rpcSchema.ts:47](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/rpcSchema.ts#L47)
