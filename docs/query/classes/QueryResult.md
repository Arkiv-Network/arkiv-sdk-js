[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / QueryResult

# Class: QueryResult\<TEntity\>

Defined in: [src/query/queryResult.ts:14](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L14)

The result of a query. Holds the fetched entities and supports cursor-based pagination.

## Type Parameters

### TEntity

`TEntity` = [`Entity`](../../main/interfaces/Entity.md)

The shape of each entity, inferred from the query builder
  (a full [Entity](../../main/interfaces/Entity.md), or a projected object inferred from a `select()` selection).

## Constructors

### Constructor

> **new QueryResult**\<`TEntity`\>(`entities`, `queryBuilder`, `cursor`, `limit`, `validAtBlock`): `QueryResult`\<`TEntity`\>

Defined in: [src/query/queryResult.ts:31](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L31)

#### Parameters

##### entities

`TEntity`[]

##### queryBuilder

[`BaseQueryBuilder`](BaseQueryBuilder.md)\<`TEntity`\>

##### cursor

`string` | `undefined`

##### limit

`number` | `undefined`

##### validAtBlock

`bigint` | `undefined`

#### Returns

`QueryResult`\<`TEntity`\>

## Properties

### entities

> **entities**: `TEntity`[]

Defined in: [src/query/queryResult.ts:15](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L15)

## Accessors

### cursor

#### Get Signature

> **get** **cursor**(): `string` \| `undefined`

Defined in: [src/query/queryResult.ts:27](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L27)

##### Returns

`string` \| `undefined`

***

### queryBuilder

#### Get Signature

> **get** **queryBuilder**(): [`BaseQueryBuilder`](BaseQueryBuilder.md)\<`TEntity`\>

Defined in: [src/query/queryResult.ts:23](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L23)

##### Returns

[`BaseQueryBuilder`](BaseQueryBuilder.md)\<`TEntity`\>

## Methods

### hasNextPage()

> **hasNextPage**(): `boolean`

Defined in: [src/query/queryResult.ts:67](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L67)

#### Returns

`boolean`

***

### next()

> **next**(): `Promise`\<`void`\>

Defined in: [src/query/queryResult.ts:46](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryResult.ts#L46)

#### Returns

`Promise`\<`void`\>
