[**@arkiv-network/sdk v0.6.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / PublicArkivClient

# Type Alias: PublicArkivClient\<transport, chain, accountOrAddress, rpcSchema\>

> **PublicArkivClient**\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`, [`PublicArkivActions`](PublicArkivActions.md)\<`transport`, `chain`\>\>\>

Defined in: [src/clients/createPublicClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/2ea409e4a615ac295234b8ab33be508f9a65f324/src/clients/createPublicClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### accountOrAddress

`accountOrAddress` *extends* `Account` \| `undefined` = `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](ArkivRpcSchema.md)
