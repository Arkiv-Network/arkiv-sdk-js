[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / BaseQueryBuilder

# Abstract Class: BaseQueryBuilder\<TEntity\>

Defined in: [src/query/queryBuilder.ts:85](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L85)

BaseQueryBuilder holds the query-building logic shared by every query builder
(filtering, ordering, pagination, execution). It follows the Builder pattern,
allowing methods to be chained. Subclasses decide how data selection is expressed
by implementing the protected `selectionParams` method.

Use [SelectQueryBuilder](SelectQueryBuilder.md) via `client.select()` to build and execute queries.

## Extended by

- [`QueryBuilder`](QueryBuilder.md)
- [`SelectQueryBuilder`](SelectQueryBuilder.md)

## Type Parameters

### TEntity

`TEntity`

The shape of each entity produced by [BaseQueryBuilder.fetch](#fetch).

## Constructors

### Constructor

> **new BaseQueryBuilder**\<`TEntity`\>(`client`): `BaseQueryBuilder`\<`TEntity`\>

Defined in: [src/query/queryBuilder.ts:95](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L95)

#### Parameters

##### client

[`ArkivClient`](../../main/type-aliases/ArkivClient.md)

#### Returns

`BaseQueryBuilder`\<`TEntity`\>

## Methods

### count()

> **count**(): `Promise`\<`number`\>

Defined in: [src/query/queryBuilder.ts:317](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L317)

Counts the entities from the query.

#### Returns

`Promise`\<`number`\>

The number of entities

#### Example

```ts
const builder = client.select()
const result = await builder.where(eq("name", "John")).count()
// result = 10
```

***

### createdBy()

> **createdBy**(`createdBy`): `this`

Defined in: [src/query/queryBuilder.ts:123](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L123)

Sets the createdBy filter

#### Parameters

##### createdBy

`` `0x${string}` ``

The address of the creator

#### Returns

`this`

The query builder instance

#### Example

```ts
const builder = client.select()
builder.createdBy("0x1234567890123456789012345678901234567890")
```

***

### cursor()

> **cursor**(`cursor`): `this`

Defined in: [src/query/queryBuilder.ts:222](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L222)

Sets the cursor for the query - it is advances setting which rather shouldn't be used manually but it is provided from query result if limit is used (pagination).

#### Parameters

##### cursor

`string`

The cursor to set which tells to RPC Query server where to start or continue the query.

#### Returns

`this`

The query builder instance

#### Example

```ts
const builder = client.select()
builder.cursor("0xABC123")
```

***

### fetch()

> **fetch**(): `Promise`\<[`QueryResult`](QueryResult.md)\<`TEntity`\>\>

Defined in: [src/query/queryBuilder.ts:288](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L288)

Fetches the entities from the query.
It will return a QueryResult instance which can be used to fetch the next and previous pages.

#### Returns

`Promise`\<[`QueryResult`](QueryResult.md)\<`TEntity`\>\>

The QueryResult instance [QueryResult](QueryResult.md)

#### Example

```ts
const builder = client.select()
const result = await builder.where(eq("name", "John")).fetch()
// result = { entities: [Entity, Entity, Entity], next: async () => QueryResult, previous: async () => QueryResult }
```

***

### limit()

> **limit**(`limit`): `this`

Defined in: [src/query/queryBuilder.ts:208](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L208)

Sets the limit for the query

#### Parameters

##### limit

`number`

The number of entities to return

#### Returns

`this`

The query builder instance

#### Example

```ts
const builder = client.select()
builder.limit(10)
```

***

### ~~orderBy()~~

#### Call Signature

> **orderBy**(`attributeName`, `attributeType`, `order?`): `this`

Defined in: [src/query/queryBuilder.ts:148](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L148)

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

The query builder instance

##### Deprecated

Server-side ordering is not supported by the network, so this method has no
effect on the returned order. Sort the fetched entities in JavaScript instead, e.g.
`result.entities.sort((a, b) => ...)`. This method will be removed in a future release.

##### Example

```ts
const builder = client.select()
builder.orderBy("name", "string", "desc")
builder.orderBy(asc("name", "string"))
builder.orderBy(desc("name", "string"))
```

#### Call Signature

> **orderBy**(`orderByAttribute`): `this`

Defined in: [src/query/queryBuilder.ts:165](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L165)

Sets the orderBy for the query.
This method takes the OrderByAttribute object as an argument and is mainly
used to use the helper functions asc() and desc() to create the OrderByAttribute instances.

##### Parameters

###### orderByAttribute

[`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

The OrderByAttribute instance to set

##### Returns

`this`

The query builder instance

##### Deprecated

Server-side ordering is not supported by the network, so this method has no
effect on the returned order. Sort the fetched entities in JavaScript instead, e.g.
`result.entities.sort((a, b) => ...)`. This method will be removed in a future release.

##### Example

```ts
const builder = client.select()
builder.orderBy(asc("name", "string"))
builder.orderBy(desc("name", "string"))
```

***

### ownedBy()

> **ownedBy**(`ownedBy`): `this`

Defined in: [src/query/queryBuilder.ts:109](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L109)

Sets the ownedBy filter

#### Parameters

##### ownedBy

`` `0x${string}` ``

The address of the owner

#### Returns

`this`

The query builder instance

#### Example

```ts
const builder = client.select()
builder.ownedBy("0x1234567890123456789012345678901234567890")
```

***

### validAtBlock()

> **validAtBlock**(`validAtBlock`): `this`

Defined in: [src/query/queryBuilder.ts:237](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L237)

Sets the validAtBlock for the query which tells at which block height the state we are intested.
If not set, the latest block is  used.

#### Parameters

##### validAtBlock

`bigint`

The block number to set

#### Returns

`this`

The query builder instance

#### Example

```ts
const builder = client.select()
builder.validAtBlock(10000)
```

***

### where()

#### Call Signature

> **where**(`predicates`): `this`

Defined in: [src/query/queryBuilder.ts:259](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L259)

Sets the predicates for the query limiting the results. It can be a single predicate,
multiple predicates passed as separate arguments, or an array of predicates - all combined with 'and'.
Predicates can be nested using 'or' and 'and' predicates.

##### Parameters

###### predicates

[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to set, either as a single array or as separate arguments

##### Returns

`this`

The query builder instance

##### Example

```ts
const builder = client.select()
builder.where(eq("name", "John"))
builder.where(eq("name", "John"), eq("age", 30))
builder.where([eq("name", "John"), eq("age", 30)])
builder.where(eq("name", "John"), or(eq("age", 30), eq("age", 31)))
builder.where(eq("name", "John"), and(eq("age", 30), eq("age", 31)))
builder.where(eq("name", "John"), or(eq("age", 30), and(eq("age", 31), eq("age", 32))))
builder.where(eq("name", "John"), and(eq("age", 30), or(eq("age", 31), eq("age", 32))))
```

#### Call Signature

> **where**(...`predicates`): `this`

Defined in: [src/query/queryBuilder.ts:260](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L260)

Sets the predicates for the query limiting the results. It can be a single predicate,
multiple predicates passed as separate arguments, or an array of predicates - all combined with 'and'.
Predicates can be nested using 'or' and 'and' predicates.

##### Parameters

###### predicates

...[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to set, either as a single array or as separate arguments

##### Returns

`this`

The query builder instance

##### Example

```ts
const builder = client.select()
builder.where(eq("name", "John"))
builder.where(eq("name", "John"), eq("age", 30))
builder.where([eq("name", "John"), eq("age", 30)])
builder.where(eq("name", "John"), or(eq("age", 30), eq("age", 31)))
builder.where(eq("name", "John"), and(eq("age", 30), eq("age", 31)))
builder.where(eq("name", "John"), or(eq("age", 30), and(eq("age", 31), eq("age", 32))))
builder.where(eq("name", "John"), and(eq("age", 30), or(eq("age", 31), eq("age", 32))))
```
