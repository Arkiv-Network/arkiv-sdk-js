[**@arkiv-network/sdk v0.6.2**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / PublicArkivClient

# Type Alias: PublicArkivClient\<transport, chain, accountOrAddress, rpcSchema\>

> **PublicArkivClient**\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`, [`PublicArkivActions`](PublicArkivActions.md)\<`transport`, `chain`\>\>\>

Defined in: [src/clients/createPublicClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/clients/createPublicClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### accountOrAddress

`accountOrAddress` *extends* `Account` \| `undefined` = `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](ArkivRpcSchema.md)
