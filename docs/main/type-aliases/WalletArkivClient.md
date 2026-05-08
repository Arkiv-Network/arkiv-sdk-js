[**@arkiv-network/sdk v0.6.7**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / WalletArkivClient

# Type Alias: WalletArkivClient\<transport, chain, account, rpcSchema\>

> **WalletArkivClient**\<`transport`, `chain`, `account`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `account`, `rpcSchema`, [`WalletArkivActions`](WalletArkivActions.md)\<`transport`, `chain`, `account`\>\>\>

Defined in: [src/clients/createWalletClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/43e079f620d2ee06236e15bdaccf1497199dca0b/src/clients/createWalletClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](ArkivRpcSchema.md)
