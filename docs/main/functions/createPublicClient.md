[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / createPublicClient

# Function: createPublicClient()

> **createPublicClient**\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`\>(`parameters`): `object`

Defined in: [src/clients/createPublicClient.ts:44](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/clients/createPublicClient.ts#L44)

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

The current block timing. GetBlockTimingReturnType

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

The number of entities in the DBChain. number

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

> **query**: (`query`) => `Promise`\<[`Entity`](../interfaces/Entity.md)[]\>

Returns a QueryResult instance for fetching the results of a raw query.

#### Parameters

##### query

`string`

#### Returns

`Promise`\<[`Entity`](../interfaces/Entity.md)[]\>

A QueryResult instance for fetching the results of a raw query. QueryResult

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
  transport: http(),
})
const queryResult = client.query('key = value && $owner = 0x123')
```

### subscribeEntityEvents()

> **subscribeEntityEvents**: (`events`, `pollingInterval?`, `fromBlock?`) => `Promise`\<() => `void`\>

Subscribes to entity events.

#### Parameters

##### events

to watch - {onError, onEntityCreated, onEntityUpdated, onEntityDeleted, onEntityExpiresInExtended}

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

The polling interval in milliseconds. number

##### fromBlock?

`bigint`

The block number to start from. bigint

#### Returns

`Promise`\<() => `void`\>

A function to unsubscribe from the events. {() => void}

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
