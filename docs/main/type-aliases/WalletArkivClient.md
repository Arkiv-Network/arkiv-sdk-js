[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / WalletArkivClient

# Type Alias: WalletArkivClient\<transport, chain, account, rpcSchema\>

> **WalletArkivClient**\<`transport`, `chain`, `account`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `account`, `rpcSchema`, [`WalletArkivActions`](WalletArkivActions.md)\<`transport`, `chain`, `account`\>\>\>

Defined in: [src/clients/createWalletClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/08d5204746de17cd551f756b87a4d260c4eda928/src/clients/createWalletClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](ArkivRpcSchema.md)
