[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [query/engine](../index.md) / processQuery

# Function: processQuery()

> **processQuery**(`client`, `queryParams`): `Promise`\<\{ `blockNumber`: `bigint`; `cursor`: `string`; `data`: [`RpcEntity`](../../../types/rpcSchema/type-aliases/RpcEntity.md)[]; \}\>

Defined in: [src/query/engine.ts:45](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/engine.ts#L45)

## Parameters

### client

[`ArkivClient`](../../../clients/baseClient/type-aliases/ArkivClient.md)

### queryParams

#### createdBy

`` `0x${string}` `` \| `undefined`

#### cursor

`string` \| `undefined`

#### limit

`number` \| `undefined`

#### orderBy

[`RpcOrderByAttribute`](../../../types/rpcSchema/type-aliases/RpcOrderByAttribute.md)[] \| `undefined`

#### ownedBy

`` `0x${string}` `` \| `undefined`

#### predicates

[`Predicate`](../../predicate/type-aliases/Predicate.md)[]

#### validAtBlock?

`bigint`

#### withAttributes?

`boolean`

#### withMetadata?

`boolean`

#### withPayload?

`boolean`

## Returns

`Promise`\<\{ `blockNumber`: `bigint`; `cursor`: `string`; `data`: [`RpcEntity`](../../../types/rpcSchema/type-aliases/RpcEntity.md)[]; \}\>
