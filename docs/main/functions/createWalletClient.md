[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / createWalletClient

# Function: createWalletClient()

> **createWalletClient**\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`\>(`parameters`): `object`

Defined in: [src/clients/createWalletClient.ts:44](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/08d5204746de17cd551f756b87a4d260c4eda928/src/clients/createWalletClient.ts#L44)

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

Configuration object for the wallet client (chain, transport, account, etc.)

## Returns

A Arkiv Wallet Client. [WalletArkivClient](../type-aliases/WalletArkivClient.md)

### changeOwnership()

> **changeOwnership**: (`data`, `txParams?`) => `Promise`\<[`ChangeOwnershipReturnType`](../type-aliases/ChangeOwnershipReturnType.md)\>

Changes the ownership of the entity with the given address.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/changeOwnership
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`ChangeOwnershipParameters`](../type-aliases/ChangeOwnershipParameters.md)

The ownership change parameters

##### txParams?

[`TxParams`](../type-aliases/TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`ChangeOwnershipReturnType`](../type-aliases/ChangeOwnershipReturnType.md)\>

The entity with updated ownership and transaction hash

### createEntity()

> **createEntity**: (`data`, `txParams?`) => `Promise`\<[`CreateEntityReturnType`](../type-aliases/CreateEntityReturnType.md)\>

Creates a new entity.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/createEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`CreateEntityParameters`](../type-aliases/CreateEntityParameters.md)

The entity creation parameters

##### txParams?

[`TxParams`](../type-aliases/TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`CreateEntityReturnType`](../type-aliases/CreateEntityReturnType.md)\>

The created entity with transaction hash

#### Example

```ts
import { createPublicClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createPublicClient({
  chain: kaolin,
  transport: http(),
})
const { entityKey, txHash } = await client.createEntity({
  payload: toBytes(JSON.stringify({ entity: { entityType: "testType", entityId: "testId" } })),
  attributes: [{ key: "testKey", value: "testValue" }],
  expiresIn: 1000,
})
console.log("entityKey", entityKey)
console.log("txHash", txHash)
// {
//   entityKey: "0x123",
//   txHash: "0x123",
// }
```

### deleteEntity()

> **deleteEntity**: (`data`, `txParams?`) => `Promise`\<[`DeleteEntityReturnType`](../type-aliases/DeleteEntityReturnType.md)\>

Deletes the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/deleteEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`DeleteEntityParameters`](../type-aliases/DeleteEntityParameters.md)

The entity deletion parameters

##### txParams?

[`TxParams`](../type-aliases/TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`DeleteEntityReturnType`](../type-aliases/DeleteEntityReturnType.md)\>

The deleted entity with transaction hash

#### Example

```ts
import { createWalletClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createWalletClient({
  chain: kaolin,
  transport: http(),
})
const { entityKey, txHash } = await client.deleteEntity({ entityKey: "0x123" })
console.log("entityKey", entityKey)
console.log("txHash", txHash)
// {
//   entityKey: "0x123",
//   txHash: "0x123",
// }
```

### extendEntity()

> **extendEntity**: (`data`, `txParams?`) => `Promise`\<[`ExtendEntityReturnType`](../type-aliases/ExtendEntityReturnType.md)\>

Extends the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/extendEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`ExtendEntityParameters`](../type-aliases/ExtendEntityParameters.md)

The entity update parameters

##### txParams?

[`TxParams`](../type-aliases/TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`ExtendEntityReturnType`](../type-aliases/ExtendEntityReturnType.md)\>

The updated entity with transaction hash

#### Example

```ts
import { createWalletClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createWalletClient({
  chain: kaolin,
  transport: http(),
})
const { entityKey, txHash } = await client.extendEntity("0x123", {
  expiresIn: 1000,
})
console.log("entityKey", entityKey)
console.log("txHash", txHash)
// {
//   entityKey: "0x123",
//   txHash: "0x123",
// }
```

### mutateEntities()

> **mutateEntities**: (`data`, `txParams?`) => `Promise`\<[`MutateEntitiesReturnType`](../type-aliases/MutateEntitiesReturnType.md)\>

Mutates the entities with the given keys.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/mutateEntities
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`MutateEntitiesParameters`](../type-aliases/MutateEntitiesParameters.md)

The mutation parameters (creates, updates, deletes, extensions)

##### txParams?

[`TxParams`](../type-aliases/TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`MutateEntitiesReturnType`](../type-aliases/MutateEntitiesReturnType.md)\>

The mutation result with transaction hash

#### Example

```ts
import { createWalletClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createWalletClient({
  chain: kaolin,
  transport: http(),
})
const { entityKey, txHash } = await client.mutateEntities({
  creates: [{
    payload: toBytes(JSON.stringify({ entity: { entityType: "testType", entityId: "testId" } })),
    attriubutes: [{ key: "testKey", value: "testValue" }],
    expiresIn: 1000,
  }],
  updates: [{
    entityKey: "0x123",
    payload: toBytes(JSON.stringify({ entity: { entityType: "testType", entityId: "testId" } })),
    attributes: [{ key: "testKey", value: "testValue" }],
    expiresIn: 1000,
  }],
  deletes: [{
    entityKey: "0x321",
  }],
  extensions: [{
    entityKey: "0x1234",
    expiresIn: 1000,
  }],
})
console.log("entityKey", entityKey)
console.log("txHash", txHash)
// {
//   entityKey: "0x123",
//   txHash: "0x123",
// }
```

### updateEntity()

> **updateEntity**: (`data`, `txParams?`) => `Promise`\<[`UpdateEntityReturnType`](../type-aliases/UpdateEntityReturnType.md)\>

Updates the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/updateEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`UpdateEntityParameters`](../type-aliases/UpdateEntityParameters.md)

The entity update parameters

##### txParams?

[`TxParams`](../type-aliases/TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`UpdateEntityReturnType`](../type-aliases/UpdateEntityReturnType.md)\>

The updated entity with transaction hash

#### Example

```ts
import { createWalletClient, http } from 'arkiv'
import { kaolin } from 'arkiv/chains'

const client = createWalletClient({
  chain: kaolin,
  transport: http(),
})
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
