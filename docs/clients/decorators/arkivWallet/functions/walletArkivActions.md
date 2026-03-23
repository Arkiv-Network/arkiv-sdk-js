[**@arkiv-network/sdk v0.6.5-dev.10**](../../../../index.md)

***

[@arkiv-network/sdk](../../../../index.md) / [clients/decorators/arkivWallet](../index.md) / walletArkivActions

# Function: walletArkivActions()

> **walletArkivActions**\<`transport`, `chain`, `account`\>(`client`): `object`

Defined in: [src/clients/decorators/arkivWallet.ts:238](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/clients/decorators/arkivWallet.ts#L238)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`

## Parameters

### client

`Client`\<`transport`, `chain`, `account`\>

## Returns

`object`

### changeOwnership

> **changeOwnership**: (`data`, `txParams?`) => `Promise`\<[`ChangeOwnershipReturnType`](../../../../actions/wallet/changeOwnership/type-aliases/ChangeOwnershipReturnType.md)\>

#### Parameters

##### data

[`ChangeOwnershipParameters`](../../../../actions/wallet/changeOwnership/type-aliases/ChangeOwnershipParameters.md)

##### txParams?

[`TxParams`](../../../../types/txParams/type-aliases/TxParams.md)

#### Returns

`Promise`\<[`ChangeOwnershipReturnType`](../../../../actions/wallet/changeOwnership/type-aliases/ChangeOwnershipReturnType.md)\>

### createEntity

> **createEntity**: (`data`, `txParams?`) => `Promise`\<[`CreateEntityReturnType`](../../../../actions/wallet/createEntity/type-aliases/CreateEntityReturnType.md)\>

#### Parameters

##### data

[`CreateEntityParameters`](../../../../actions/wallet/createEntity/type-aliases/CreateEntityParameters.md)

##### txParams?

[`TxParams`](../../../../types/txParams/type-aliases/TxParams.md)

#### Returns

`Promise`\<[`CreateEntityReturnType`](../../../../actions/wallet/createEntity/type-aliases/CreateEntityReturnType.md)\>

### deleteEntity

> **deleteEntity**: (`data`, `txParams?`) => `Promise`\<[`DeleteEntityReturnType`](../../../../actions/wallet/deleteEntity/type-aliases/DeleteEntityReturnType.md)\>

#### Parameters

##### data

[`DeleteEntityParameters`](../../../../actions/wallet/deleteEntity/type-aliases/DeleteEntityParameters.md)

##### txParams?

[`TxParams`](../../../../types/txParams/type-aliases/TxParams.md)

#### Returns

`Promise`\<[`DeleteEntityReturnType`](../../../../actions/wallet/deleteEntity/type-aliases/DeleteEntityReturnType.md)\>

### extendEntity

> **extendEntity**: (`data`, `txParams?`) => `Promise`\<[`ExtendEntityReturnType`](../../../../actions/wallet/extendEntity/type-aliases/ExtendEntityReturnType.md)\>

#### Parameters

##### data

[`ExtendEntityParameters`](../../../../actions/wallet/extendEntity/type-aliases/ExtendEntityParameters.md)

##### txParams?

[`TxParams`](../../../../types/txParams/type-aliases/TxParams.md)

#### Returns

`Promise`\<[`ExtendEntityReturnType`](../../../../actions/wallet/extendEntity/type-aliases/ExtendEntityReturnType.md)\>

### mutateEntities

> **mutateEntities**: (`data`, `txParams?`) => `Promise`\<[`MutateEntitiesReturnType`](../../../../actions/wallet/mutateEntities/type-aliases/MutateEntitiesReturnType.md)\>

#### Parameters

##### data

[`MutateEntitiesParameters`](../../../../actions/wallet/mutateEntities/type-aliases/MutateEntitiesParameters.md)

##### txParams?

[`TxParams`](../../../../types/txParams/type-aliases/TxParams.md)

#### Returns

`Promise`\<[`MutateEntitiesReturnType`](../../../../actions/wallet/mutateEntities/type-aliases/MutateEntitiesReturnType.md)\>

### updateEntity

> **updateEntity**: (`data`, `txParams?`) => `Promise`\<[`UpdateEntityReturnType`](../../../../actions/wallet/updateEntity/type-aliases/UpdateEntityReturnType.md)\>

#### Parameters

##### data

[`UpdateEntityParameters`](../../../../actions/wallet/updateEntity/type-aliases/UpdateEntityParameters.md)

##### txParams?

[`TxParams`](../../../../types/txParams/type-aliases/TxParams.md)

#### Returns

`Promise`\<[`UpdateEntityReturnType`](../../../../actions/wallet/updateEntity/type-aliases/UpdateEntityReturnType.md)\>
