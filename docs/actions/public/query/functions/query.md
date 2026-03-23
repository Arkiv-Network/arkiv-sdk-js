[**@arkiv-network/sdk v0.6.5-dev.10**](../../../../index.md)

***

[@arkiv-network/sdk](../../../../index.md) / [actions/public/query](../index.md) / query

# Function: query()

> **query**(`client`, `query`, `queryOptions?`): `Promise`\<\{ `blockNumber`: `bigint`; `cursor`: `string`; `entities`: [`Entity`](../../../../types/entity/classes/Entity.md)[]; \}\>

Defined in: [src/actions/public/query.ts:32](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/actions/public/query.ts#L32)

## Parameters

### client

[`ArkivClient`](../../../../clients/baseClient/type-aliases/ArkivClient.md)

### query

`string`

### queryOptions?

[`QueryOptions`](../type-aliases/QueryOptions.md)

## Returns

`Promise`\<\{ `blockNumber`: `bigint`; `cursor`: `string`; `entities`: [`Entity`](../../../../types/entity/classes/Entity.md)[]; \}\>
