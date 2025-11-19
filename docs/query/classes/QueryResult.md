[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / QueryResult

# Class: QueryResult

Defined in: [src/query/queryResult.ts:8](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L8)

## Constructors

### Constructor

> **new QueryResult**(`entities`, `queryBuilder`, `cursor`, `limit`, `validAtBlock`): `QueryResult`

Defined in: [src/query/queryResult.ts:25](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L25)

#### Parameters

##### entities

[`Entity`](../../main/interfaces/Entity.md)[]

##### queryBuilder

[`QueryBuilder`](QueryBuilder.md)

##### cursor

`string` | `undefined`

##### limit

`number` | `undefined`

##### validAtBlock

`bigint` | `undefined`

#### Returns

`QueryResult`

## Properties

### entities

> **entities**: [`Entity`](../../main/interfaces/Entity.md)[]

Defined in: [src/query/queryResult.ts:9](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L9)

## Accessors

### cursor

#### Get Signature

> **get** **cursor**(): `string` \| `undefined`

Defined in: [src/query/queryResult.ts:21](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L21)

##### Returns

`string` \| `undefined`

***

### queryBuilder

#### Get Signature

> **get** **queryBuilder**(): [`QueryBuilder`](QueryBuilder.md)

Defined in: [src/query/queryResult.ts:17](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L17)

##### Returns

[`QueryBuilder`](QueryBuilder.md)

## Methods

### hasNextPage()

> **hasNextPage**(): `boolean`

Defined in: [src/query/queryResult.ts:61](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L61)

#### Returns

`boolean`

***

### next()

> **next**(): `Promise`\<`void`\>

Defined in: [src/query/queryResult.ts:40](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryResult.ts#L40)

#### Returns

`Promise`\<`void`\>
