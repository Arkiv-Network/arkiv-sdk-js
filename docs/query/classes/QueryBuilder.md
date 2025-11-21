[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / QueryBuilder

# Class: QueryBuilder

Defined in: [src/query/queryBuilder.ts:54](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L54)

QueryBuilder is a helper class to build queries to the Arkiv DBChains.
It can be used to fetch entities from the Arkiv DBChains. It follows the Builder pattern allowing chaining of methods.

## Param

The Arkiv client

## Constructors

### Constructor

> **new QueryBuilder**(`client`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:66](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L66)

#### Parameters

##### client

[`ArkivClient`](../../main/type-aliases/ArkivClient.md)

#### Returns

`QueryBuilder`

## Methods

### count()

> **count**(): `Promise`\<`number`\>

Defined in: [src/query/queryBuilder.ts:300](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L300)

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

### cursor()

> **cursor**(`cursor`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:213](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L213)

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

Defined in: [src/query/queryBuilder.ts:268](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L268)

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

Defined in: [src/query/queryBuilder.ts:199](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L199)

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

### orderBy()

#### Call Signature

> **orderBy**(`attributeName`, `attributeType`, `order?`): `this`

Defined in: [src/query/queryBuilder.ts:101](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L101)

Sets the orderBy for the query.
It can be called multiple times to order by multiple attributes.
The order of the attributes is important. The first attribute is the primary order by attribute.
You can use the helper functions asc() and desc() as input for this method.

##### Parameters

###### attributeName

`string`

The name of the attribute to order by

###### attributeType

The type of the attribute to order by (string or number)

`"string"` | `"number"`

###### order?

The order to set the order by (asc or desc)

`"asc"` | `"desc"`

##### Returns

`this`

The QueryBuilder instance

##### Example

```ts
const builder = client.buildQuery()
builder.orderBy("name", "string", "desc")
builder.orderBy(asc("name", "string"))
builder.orderBy(desc("name", "string"))
```

#### Call Signature

> **orderBy**(`orderByAttribute`): `this`

Defined in: [src/query/queryBuilder.ts:114](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L114)

Sets the orderBy for the query.
This method takes the OrderByAttribute object as an argument and is mainly
used to use the helper functions asc() and desc() to create the OrderByAttribute instances.

##### Parameters

###### orderByAttribute

[`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

The OrderByAttribute instance to set

##### Returns

`this`

The QueryBuilder instance

##### Example

```ts
const builder = new QueryBuilder(client)
builder.orderBy(asc("name", "string"))
builder.orderBy(desc("name", "string"))
```

***

### ownedBy()

> **ownedBy**(`ownedBy`): `QueryBuilder`

Defined in: [src/query/queryBuilder.ts:80](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L80)

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

Defined in: [src/query/queryBuilder.ts:228](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L228)

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

Defined in: [src/query/queryBuilder.ts:249](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L249)

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

Defined in: [src/query/queryBuilder.ts:157](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L157)

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

Defined in: [src/query/queryBuilder.ts:171](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L171)

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

Defined in: [src/query/queryBuilder.ts:185](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/queryBuilder.ts#L185)

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
