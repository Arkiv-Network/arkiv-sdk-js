[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / WalletArkivActions

# Type Alias: WalletArkivActions\<transport, chain, account\>

> **WalletArkivActions**\<`transport`, `chain`, `account`\> = `Pick`\<`PublicActions`\<`transport`, `chain`, `account`\>, `"waitForTransactionReceipt"`\> & `Pick`\<`WalletActions`\<`chain`, `account`\>, `"addChain"` \| `"sendTransaction"` \| `"sendTransactionSync"` \| `"sendRawTransaction"` \| `"sendRawTransactionSync"` \| `"signMessage"` \| `"signTransaction"`\> & `object`

Defined in: [src/clients/decorators/arkivWallet.ts:34](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/clients/decorators/arkivWallet.ts#L34)

## Type Declaration

### changeOwnership()

> **changeOwnership**: (`data`, `txParams?`) => `Promise`\<[`ChangeOwnershipReturnType`](ChangeOwnershipReturnType.md)\>

Changes the ownership of the entity with the given address.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/changeOwnership
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`ChangeOwnershipParameters`](ChangeOwnershipParameters.md)

The ownership change parameters

##### txParams?

[`TxParams`](TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`ChangeOwnershipReturnType`](ChangeOwnershipReturnType.md)\>

The entity with updated ownership and transaction hash

### createEntity()

> **createEntity**: (`data`, `txParams?`) => `Promise`\<[`CreateEntityReturnType`](CreateEntityReturnType.md)\>

Creates a new entity.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/createEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`CreateEntityParameters`](CreateEntityParameters.md)

The entity creation parameters

##### txParams?

[`TxParams`](TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`CreateEntityReturnType`](CreateEntityReturnType.md)\>

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

> **deleteEntity**: (`data`, `txParams?`) => `Promise`\<[`DeleteEntityReturnType`](DeleteEntityReturnType.md)\>

Deletes the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/deleteEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`DeleteEntityParameters`](DeleteEntityParameters.md)

The entity deletion parameters

##### txParams?

[`TxParams`](TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`DeleteEntityReturnType`](DeleteEntityReturnType.md)\>

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

> **extendEntity**: (`data`, `txParams?`) => `Promise`\<[`ExtendEntityReturnType`](ExtendEntityReturnType.md)\>

Extends the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/extendEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`ExtendEntityParameters`](ExtendEntityParameters.md)

The entity update parameters

##### txParams?

[`TxParams`](TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`ExtendEntityReturnType`](ExtendEntityReturnType.md)\>

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

> **mutateEntities**: (`data`, `txParams?`) => `Promise`\<[`MutateEntitiesReturnType`](MutateEntitiesReturnType.md)\>

Mutates the entities with the given keys.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/mutateEntities
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`MutateEntitiesParameters`](MutateEntitiesParameters.md)

The mutation parameters (creates, updates, deletes, extensions)

##### txParams?

[`TxParams`](TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`MutateEntitiesReturnType`](MutateEntitiesReturnType.md)\>

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

> **updateEntity**: (`data`, `txParams?`) => `Promise`\<[`UpdateEntityReturnType`](UpdateEntityReturnType.md)\>

Updates the entity with the given key.

- Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/updateEntity
- JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)

#### Parameters

##### data

[`UpdateEntityParameters`](UpdateEntityParameters.md)

The entity update parameters

##### txParams?

[`TxParams`](TxParams.md)

Optional transaction parameters

#### Returns

`Promise`\<[`UpdateEntityReturnType`](UpdateEntityReturnType.md)\>

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

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`
