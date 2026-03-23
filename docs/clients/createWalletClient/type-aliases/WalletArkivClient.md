[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [clients/createWalletClient](../index.md) / WalletArkivClient

# Type Alias: WalletArkivClient\<transport, chain, account, rpcSchema\>

> **WalletArkivClient**\<`transport`, `chain`, `account`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `account`, `rpcSchema`, [`WalletArkivActions`](../../decorators/arkivWallet/type-aliases/WalletArkivActions.md)\<`transport`, `chain`, `account`\>\>\>

Defined in: [src/clients/createWalletClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/clients/createWalletClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### account

`account` *extends* `Account` \| `undefined` = `Account` \| `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](../../../types/rpcSchema/type-aliases/ArkivRpcSchema.md)
