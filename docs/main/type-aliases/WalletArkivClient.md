[**@arkiv-network/sdk v0.7.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / WalletArkivClient

# Type Alias: WalletArkivClient\<transport, chain, account, rpcSchema\>

> **WalletArkivClient**\<`transport`, `chain`, `account`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `account`, `rpcSchema`, [`WalletArkivActions`](WalletArkivActions.md)\<`transport`, `chain`, `account`\>\>\>

Defined in: [src/clients/createWalletClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/clients/createWalletClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](ArkivRpcSchema.md)
