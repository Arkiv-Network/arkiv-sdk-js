[**@arkiv-network/sdk v0.6.5-dev.10**](../../../../index.md)

***

[@arkiv-network/sdk](../../../../index.md) / [clients/decorators/arkivPublic](../index.md) / publicArkivActions

# Function: publicArkivActions()

> **publicArkivActions**\<`transport`, `chain`, `account`\>(`client`): `object`

Defined in: [src/clients/decorators/arkivPublic.ts:191](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/clients/decorators/arkivPublic.ts#L191)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`

## Parameters

### client

`Client`\<`transport`, `chain`, `account`\>

## Returns

`object`

### buildQuery

> **buildQuery**: () => [`QueryBuilder`](../../../../query/queryBuilder/classes/QueryBuilder.md)

#### Returns

[`QueryBuilder`](../../../../query/queryBuilder/classes/QueryBuilder.md)

### getBlockTiming

> **getBlockTiming**: () => `Promise`\<\{ `blockDuration`: `number`; `currentBlock`: `bigint`; `currentBlockTime`: `number`; \}\>

#### Returns

`Promise`\<\{ `blockDuration`: `number`; `currentBlock`: `bigint`; `currentBlockTime`: `number`; \}\>

### getEntity

> **getEntity**: (`key`) => `Promise`\<[`Entity`](../../../../types/entity/classes/Entity.md)\>

#### Parameters

##### key

`` `0x${string}` ``

#### Returns

`Promise`\<[`Entity`](../../../../types/entity/classes/Entity.md)\>

### getEntityCount

> **getEntityCount**: () => `Promise`\<`number`\>

#### Returns

`Promise`\<`number`\>

### query

> **query**: (`rawQuery`, `queryOptions?`) => `Promise`\<\{ `blockNumber`: `bigint`; `cursor`: `string`; `entities`: [`Entity`](../../../../types/entity/classes/Entity.md)[]; \}\>

#### Parameters

##### rawQuery

`string`

##### queryOptions?

[`QueryOptions`](../../../../actions/public/query/type-aliases/QueryOptions.md)

#### Returns

`Promise`\<\{ `blockNumber`: `bigint`; `cursor`: `string`; `entities`: [`Entity`](../../../../types/entity/classes/Entity.md)[]; \}\>

### subscribeEntityEvents

> **subscribeEntityEvents**: (`__namedParameters`, `pollingInterval?`, `fromBlock?`) => `Promise`\<() => `void`\>

#### Parameters

##### \_\_namedParameters

###### onEntityCreated?

(`event`) => `void`

###### onEntityDeleted?

(`event`) => `void`

###### onEntityExpired?

(`event`) => `void`

###### onEntityExpiresInExtended?

(`event`) => `void`

###### onEntityUpdated?

(`event`) => `void`

###### onError?

(`error`) => `void`

##### pollingInterval?

`number`

##### fromBlock?

`bigint`

#### Returns

`Promise`\<() => `void`\>
