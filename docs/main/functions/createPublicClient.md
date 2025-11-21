[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / createPublicClient

# Function: createPublicClient()

> **createPublicClient**\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`\>(`parameters`): `object`

Defined in: [src/clients/createPublicClient.ts:44](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/clients/createPublicClient.ts#L44)

Creates a Public Client with a given [Transport](https://viem.sh/docs/clients/intro) configured for a [Chain](https://viem.sh/docs/clients/chains).

- Docs: https://docs.arkiv.network/ts-sdk/clients/public

A Public Client is an interface to "public" [Ethereum JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/), [Arkiv JSON-RPC API](https://docs.arkiv.network/json-rpc/), and [Kaolin JSON-RPC API](https://kaolin.holesky.arkiv.network/rpc) methods such as retrieving block numbers, transactions, reading from smart contracts, etc through [Public Actions](/docs/actions/public/introduction).

## Type Parameters

### transport

`transport` *extends* `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `undefined`

### accountOrAddress

`accountOrAddress` *extends* `` `0x${string}` `` \| `Account` \| `undefined` = `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](../type-aliases/ArkivRpcSchema.md)

## Parameters

### parameters

Configuration object for the public client (chain, transport, etc.)

## Returns

A Arkiv Public Client. [PublicArkivClient](../type-aliases/PublicArkivClient.md)

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

The current block timing. [GetBlockTimingReturnType](../type-aliases/GetBlockTimingReturnType.md)

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

`` `0x${string}` ``

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

> **query**: (`query`, `queryOptions?`) => `Promise`\<[`QueryReturnType`](../type-aliases/QueryReturnType.md)\>

Returns a QueryResult instance for fetching the results of a raw query.
If no query options are provided, all payload is included, but no metadata (like owner, expiredAt, etc.) and attributes.

#### Parameters

##### query

`string`

The raw query string

##### queryOptions?

[`QueryOptions`](../type-aliases/QueryOptions.md)

The optional query options - [QueryOptions](../type-aliases/QueryOptions.md)

#### Returns

`Promise`\<[`QueryReturnType`](../type-aliases/QueryReturnType.md)\>

A QueryReturnType instance - [QueryReturnType](../type-aliases/QueryReturnType.md)

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

> **subscribeEntityEvents**: (`__namedParameters`, `pollingInterval?`, `fromBlock?`) => `Promise`\<() => `void`\>

Subscribes to entity events.
Takes an object with event handlers: {onError, onEntityCreated, onEntityUpdated, onEntityDeleted, onEntityExpiresInExtended}

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

## Example

```ts
import { createPublicClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
  transport: http(),
})
```
