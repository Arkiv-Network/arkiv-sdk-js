[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [query/queryResult](../index.md) / QueryResult

# Class: QueryResult

Defined in: [src/query/queryResult.ts:8](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L8)

## Constructors

### Constructor

> **new QueryResult**(`entities`, `queryBuilder`, `cursor`, `limit`, `validAtBlock`): `QueryResult`

Defined in: [src/query/queryResult.ts:25](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L25)

#### Parameters

##### entities

[`Entity`](../../../types/entity/classes/Entity.md)[]

##### queryBuilder

[`QueryBuilder`](../../queryBuilder/classes/QueryBuilder.md)

##### cursor

`string` \| `undefined`

##### limit

`number` \| `undefined`

##### validAtBlock

`bigint` \| `undefined`

#### Returns

`QueryResult`

## Properties

### \_cursor

> `private` **\_cursor**: `string` \| `undefined`

Defined in: [src/query/queryResult.ts:11](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L11)

***

### \_endOfIteration

> `private` **\_endOfIteration**: `boolean`

Defined in: [src/query/queryResult.ts:10](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L10)

***

### \_limit

> `private` **\_limit**: `number` \| `undefined`

Defined in: [src/query/queryResult.ts:12](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L12)

***

### \_queryBuilder

> `private` **\_queryBuilder**: [`QueryBuilder`](../../queryBuilder/classes/QueryBuilder.md)

Defined in: [src/query/queryResult.ts:14](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L14)

***

### \_validAtBlock

> `private` **\_validAtBlock**: `bigint` \| `undefined`

Defined in: [src/query/queryResult.ts:13](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L13)

***

### entities

> **entities**: [`Entity`](../../../types/entity/classes/Entity.md)[]

Defined in: [src/query/queryResult.ts:9](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L9)

## Accessors

### cursor

#### Get Signature

> **get** **cursor**(): `string` \| `undefined`

Defined in: [src/query/queryResult.ts:21](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L21)

##### Returns

`string` \| `undefined`

***

### queryBuilder

#### Get Signature

> **get** **queryBuilder**(): [`QueryBuilder`](../../queryBuilder/classes/QueryBuilder.md)

Defined in: [src/query/queryResult.ts:17](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L17)

##### Returns

[`QueryBuilder`](../../queryBuilder/classes/QueryBuilder.md)

## Methods

### hasNextPage()

> **hasNextPage**(): `boolean`

Defined in: [src/query/queryResult.ts:61](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L61)

#### Returns

`boolean`

***

### next()

> **next**(): `Promise`\<`void`\>

Defined in: [src/query/queryResult.ts:40](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryResult.ts#L40)

#### Returns

`Promise`\<`void`\>
