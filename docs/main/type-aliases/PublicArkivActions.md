[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / PublicArkivActions

# Type Alias: PublicArkivActions\<transport, chain, account\>

> **PublicArkivActions**\<`transport`, `chain`, `account`\> = `Pick`\<`PublicActions`\<`transport`, `chain`, `account`\>, `"getBalance"` \| `"getBlock"` \| `"getBlockNumber"` \| `"getChainId"` \| `"getLogs"` \| `"getTransaction"` \| `"getTransactionCount"` \| `"getTransactionReceipt"` \| `"waitForTransactionReceipt"` \| `"watchEvent"`\> & `object`

Defined in: [src/clients/decorators/arkivPublic.ts:18](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/clients/decorators/arkivPublic.ts#L18)

## Type Declaration

### ~~buildQuery()~~

> **buildQuery**: () => [`QueryBuilder`](../../query/classes/QueryBuilder.md)

Returns a QueryBuilder instance for building and executing queries.
The QueryBuilder object follows the Builder pattern, allowing you to chain methods to build a query and then execute it.

- Docs: https://docs.arkiv.network/ts-sdk/actions/public/query

#### Returns

[`QueryBuilder`](../../query/classes/QueryBuilder.md)

A QueryBuilder instance for building and executing queries. [QueryBuilder](../../query/classes/QueryBuilder.md)

#### Deprecated

Use select instead. `buildQuery()` returns only the entity `key` unless
you remember to opt in to data with `withAttributes()`/`withMetadata()`/`withPayload()`, which
is an easy mistake. `select()` makes the selection explicit. This method remains for backwards
compatibility and will be removed in a future release.

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
const query = client.buildQuery()
const entities = await query.where("key", "=", "value").ownedBy("0x123").fetch()
```

### getBlockTiming()

> **getBlockTiming**: () => `Promise`\<\{ `blockDuration`: `number`; `currentBlock`: `bigint`; `currentBlockTime`: `number`; \}\>

Returns the current block timing.

#### Returns

`Promise`\<\{ `blockDuration`: `number`; `currentBlock`: `bigint`; `currentBlockTime`: `number`; \}\>

The current block timing. [GetBlockTimingReturnType](GetBlockTimingReturnType.md)

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
const blockTiming = await client.getBlockTiming()
// {
//   currentBlock: 10n, // block number
//   currentBlockTime: 1234567890, // block timestamp
//   blockDuration: 2, // in seconds
// }
```

### getEntity()

> **getEntity**: (`key`) => `Promise`\<[`Entity`](../interfaces/Entity.md)\>

Returns the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/public/getEntity

#### Parameters

##### key

`Hex`

The entity key (hex string)

#### Returns

`Promise`\<[`Entity`](../interfaces/Entity.md)\>

The entity with the given key. [Entity](../interfaces/Entity.md)

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
const entity = await client.getEntity("0x123")
// {
//   key: "0x123",
//   value: "0x123",
// }
```

### getEntityCount()

> **getEntityCount**: () => `Promise`\<`number`\>

Returns the number of entities in the DBChain.

#### Returns

`Promise`\<`number`\>

The number of entities in the DBChain

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
const entityCount = await client.getEntityCount()
// entityCount = 0
```

### query()

> **query**: (`query`, `queryOptions?`) => `Promise`\<[`QueryReturnType`](QueryReturnType.md)\>

Returns a QueryResult instance for fetching the results of a raw query.
If no query options are provided, all payload is included, but no metadata (like owner, expiredAt, etc.) and attributes.

#### Parameters

##### query

`string`

The raw query string

##### queryOptions?

[`QueryOptions`](QueryOptions.md)

The optional query options - [QueryOptions](QueryOptions.md)

#### Returns

`Promise`\<[`QueryReturnType`](QueryReturnType.md)\>

A QueryReturnType instance - [QueryReturnType](QueryReturnType.md)

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
const queryResult = client.query('key = value && $owner = 0x123')
// queryResult = { entities: [{ key: "0x123", value: "0x123" }], cursor: undefined, blockNumber: undefined }
const queryResultWithOptions = client.query('key = value && $owner = 0x123', {
  includeData: {
    attributes: false,
    payload: true,
    metadata: true,
  },
  resultsPerPage: 10,
  cursor: undefined,
  atBlock: undefined,
})
// queryResultWithOptions = { entities: [{ key: "0x123", value: "0x123" }], cursor: "...", blockNumber: 32223n }
```

### select()

> **select**: \{(`selection?`): [`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`FullEntity`](../../query/type-aliases/FullEntity.md)\>; \<`S`\>(`selection`): [`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`ProjectedEntity`](../../query/type-aliases/ProjectedEntity.md)\<`S`\>\>; (`selection`): [`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`FullEntity`](../../query/type-aliases/FullEntity.md)\>; \}

Returns a SelectQueryBuilder for building and executing queries — the recommended way to
read entities. You declare up front which parts of an entity you want returned, so results
always contain exactly the data you asked for.

- Docs: https://docs.arkiv.network/ts-sdk/actions/public/query

#### Call Signature

> (`selection?`): [`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`FullEntity`](../../query/type-aliases/FullEntity.md)\>

Select every field. Pass nothing or `"*"`; the returned entities contain all fields.

##### Parameters

###### selection?

`"*"`

##### Returns

[`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`FullEntity`](../../query/type-aliases/FullEntity.md)\>

#### Call Signature

> \<`S`\>(`selection`): [`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`ProjectedEntity`](../../query/type-aliases/ProjectedEntity.md)\<`S`\>\>

Pick the entity fields to return. Set the ones you want to `true` (at least one is required);
the result is typed to exactly those fields, so reading anything else is a compile error.

Available fields: `key`, `owner`, `creator`, `contentType`, `payload`, `attributes`,
`expiresAtBlock`, `createdAtBlock`, `lastModifiedAtBlock`, `transactionIndexInBlock`,
`operationIndexInTransaction`.

Pass the selection inline so its fields stay literal `true`. A selection stored in a `let`/
`const` variable widens to `boolean` and the result type can no longer be narrowed — annotate
it `as const` (e.g. `const sel = { owner: true } as const`) in that case.

##### Type Parameters

###### S

`S` *extends* [`EntitySelection`](../../query/type-aliases/EntitySelection.md)

##### Parameters

###### selection

`S`

##### Returns

[`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`ProjectedEntity`](../../query/type-aliases/ProjectedEntity.md)\<`S`\>\>

##### Example

```ts
client.select({ owner: true, attributes: true }) // entities typed { owner, attributes }
client.select({ key: true, payload: true })       // includes payload → toText()/toJson() too
```

#### Call Signature

> (`selection`): [`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`FullEntity`](../../query/type-aliases/FullEntity.md)\>

Dynamic selection: accepts a value typed [SelectArg](../../query/type-aliases/SelectArg.md) (e.g. built at runtime). The
result cannot be narrowed in this case, so the entities are typed as the full entity.

##### Parameters

###### selection

[`SelectArg`](../../query/type-aliases/SelectArg.md)

##### Returns

[`SelectQueryBuilder`](../../query/classes/SelectQueryBuilder.md)\<[`FullEntity`](../../query/type-aliases/FullEntity.md)\>

#### Param

What to include in the results. Omit it (or pass `"*"`) to select everything,
  or pass an object to select specific parts (at least one field is required). Every part is
  opt-in, including the `key`. The selection is flat — each field maps to an entity field.
  [SelectArg](../../query/type-aliases/SelectArg.md)

#### Returns

A SelectQueryBuilder instance for building and executing queries. [SelectQueryBuilder](../../query/classes/SelectQueryBuilder.md)

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'
import { eq } from 'arkiv/query'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
// select everything
await client.select().where(eq("category", "docs")).fetch()
await client.select("*").where(eq("category", "docs")).fetch()
// only the key
await client.select({ key: true }).where(eq("category", "docs")).fetch()
// select specific fields — result typed { owner: Hex; attributes: Attribute[] }
await client.select({ owner: true, attributes: true }).fetch()
// a single field — result typed { owner: Hex }
await client.select({ owner: true }).fetch()
```

### subscribeEntityEvents()

> **subscribeEntityEvents**: (`{
      onError,
      onEntityCreated,
      onEntityUpdated,
      onEntityDeleted,
      onEntityExpiresInExtended,
    }`, `pollingInterval?`, `fromBlock?`) => `Promise`\<() => `void`\>

Subscribes to entity events.
Takes an object with event handlers: {onError, onEntityCreated, onEntityUpdated, onEntityDeleted, onEntityExpiresInExtended}

#### Parameters

##### \{
      onError,
      onEntityCreated,
      onEntityUpdated,
      onEntityDeleted,
      onEntityExpiresInExtended,
    \}

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

The polling interval in milliseconds

##### fromBlock?

`bigint`

The block number to start from

#### Returns

`Promise`\<() => `void`\>

A function to unsubscribe from the events

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { braga } from 'arkiv/chains'

const client = createPublicClient({
  chain: braga,
  transport: http(),
})
const unsubscribe = await client.subscribeEntityEvents({
  onError: (error) => console.error("subscribeEntityEvents error", error),
})
unsubscribe() // unsubscribe from the events
```

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`
