[**@arkiv-network/sdk v0.7.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / QueryBuilder

# Class: QueryBuilder

Defined in: [src/query/queryBuilder.ts:14](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L14)

QueryBuilder is a helper class to build queries to the Arkiv DBChains.
It can be used to fetch entities from the Arkiv DBChains. It follows the Builder pattern allowing chaining of methods.

## Param

The Arkiv client

## Constructors

### Constructor

> **new QueryBuilder**(`client`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L26)

#### Parameters

##### client

[`ArkivClient`](../../main/type-aliases/ArkivClient.md)

#### Returns

`QueryBuilder`

## Methods

### count()

> **count**(): `Promise`\<`number`\>

Defined in: [src/query/queryBuilder.ts:211](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L211)

Counts the entities from the query.

#### Returns

`Promise`\<`number`\>

The number of entities

#### Example

```ts
const builder = new QueryBuilder(client)
const result = await builder.where(eq("name", "John")).count()
// result = 10
```

***

### createdBy()

> **createdBy**(`createdBy`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:54](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L54)

Sets the createdBy filter

#### Parameters

##### createdBy

`` `0x${string}` ``

The address of the creator

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.createdBy("0x1234567890123456789012345678901234567890")
```

***

### cursor()

> **cursor**(`cursor`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:124](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L124)

Sets the cursor for the query - it is advances setting which rather shouldn't be used manually but it is provided from query result if limit is used (pagination).

#### Parameters

##### cursor

`string`

The cursor to set which tells to RPC Query server where to start or continue the query.

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.offset(10)
```

***

### fetch()

> **fetch**(): `Promise`\<[`QueryResult`](QueryResult.md)\>

Defined in: [src/query/queryBuilder.ts:179](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L179)

Fetches the entities from the query. Re
It will return a QueryResult instance which can be used to fetch the next and previous pages.

#### Returns

`Promise`\<[`QueryResult`](QueryResult.md)\>

The QueryResult instance [QueryResult](QueryResult.md)

#### Example

```ts
const builder = new QueryBuilder(client)
const result = await builder.where(eq("name", "John")).fetch()
// result = { entities: [Entity, Entity, Entity], next: async () => QueryResult, previous: async () => QueryResult }
```

***

### limit()

> **limit**(`limit`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:110](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L110)

Sets the limit for the query

#### Parameters

##### limit

`number`

The number of entities to return

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.limit(10)
```

***

### ownedBy()

> **ownedBy**(`ownedBy`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:40](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L40)

Sets the ownedBy filter

#### Parameters

##### ownedBy

`` `0x${string}` ``

The address of the owner

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.ownedBy("0x1234567890123456789012345678901234567890")
```

***

### validAtBlock()

> **validAtBlock**(`validAtBlock`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:139](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L139)

Sets the validAtBlock for the query which tells at which block height the state we are intested.
If not set, the latest block is  used.

#### Parameters

##### validAtBlock

`bigint`

The block number to set

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.validAtBlock(10000)
```

***

### where()

> **where**(`predicates`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:160](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L160)

Sets the predicates for the query limiting the results. It can be a single predicate or an array of predicates combined with 'and'.
Predicates can be nested using 'or' and 'and' predicates.

#### Parameters

##### predicates

The predicates to set

[`Predicate`](../type-aliases/Predicate.md) | [`Predicate`](../type-aliases/Predicate.md)[]

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.where(eq("name", "John"))
builder.where([eq("name", "John"), eq("age", 30)])
builder.where([eq("name", "John"), or([eq("age", 30), eq("age", 31)])])
builder.where([eq("name", "John"), and([eq("age", 30), eq("age", 31)])])
builder.where([eq("name", "John"), or([eq("age", 30), and([eq("age", 31), eq("age", 32)])])])
builder.where([eq("name", "John"), and([eq("age", 30), or([eq("age", 31), eq("age", 32)])])])
builder.where([eq("name", "John"), and([eq("age", 30), or([eq("age", 31), and([eq("age", 32), eq("age", 33)])])])])
```

***

### withAttributes()

> **withAttributes**(`withAttributes`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:68](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L68)

Sets the withAttributes flag which will return the attributes for the entities if true

#### Parameters

##### withAttributes

`boolean` = `true`

The boolean value to set

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.withAttributes(true)
```

***

### withMetadata()

> **withMetadata**(`withMetadata`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:82](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L82)

Sets the withMetadata flag which will return the metadata (like owner, expiredAt, etc.) for the entities if true

#### Parameters

##### withMetadata

`boolean` = `true`

The boolean value to set

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.withMetadata(true)
```

***

### withPayload()

> **withPayload**(`withPayload`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:96](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/queryBuilder.ts#L96)

Sets the withPayload flag which will return the payload for the entities if true

#### Parameters

##### withPayload

`boolean` = `true`

The boolean value to set

#### Returns

`QueryBuilder`

The QueryBuilder instance

#### Example

```ts
const builder = new QueryBuilder(client)
builder.withPayload(true)
```
