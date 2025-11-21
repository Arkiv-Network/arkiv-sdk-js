[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / PublicArkivActions

# Type Alias: PublicArkivActions\<transport, chain, account\>

> **PublicArkivActions**\<`transport`, `chain`, `account`\> = `Pick`\<`PublicActions`\<`transport`, `chain`, `account`\>, `"getBalance"` \| `"getBlock"` \| `"getBlockNumber"` \| `"getChainId"` \| `"getLogs"` \| `"getTransaction"` \| `"getTransactionCount"` \| `"getTransactionReceipt"` \| `"waitForTransactionReceipt"` \| `"watchEvent"`\> & `object`

Defined in: [src/clients/decorators/arkivPublic.ts:17](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/clients/decorators/arkivPublic.ts#L17)

## Type Declaration

### buildQuery()

> **buildQuery**: () => [`QueryBuilder`](../../query/classes/QueryBuilder.md)

Returns a QueryBuilder instance for building and executing queries.
The QueryBuilder object follows the Builder pattern, allowing you to chain methods to build a query and then execute it.

- Docs: https://docs.arkiv.network/ts-sdk/actions/public/query

#### Returns

[`QueryBuilder`](../../query/classes/QueryBuilder.md)

A QueryBuilder instance for building and executing queries. [QueryBuilder](../../query/classes/QueryBuilder.md)

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
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
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
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
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
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
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
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
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
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
  orderBy: [{ name: "key", type: "string", desc: "asc" }],
  resultsPerPage: 10,
  cursor: undefined,
  atBlock: undefined,
})
// queryResultWithOptions = { entities: [{ key: "0x123", value: "0x123" }], cursor: "...", blockNumber: 32223n }
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
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
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
