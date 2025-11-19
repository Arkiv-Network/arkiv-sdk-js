[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / PublicArkivClient

# Type Alias: PublicArkivClient\<transport, chain, accountOrAddress, rpcSchema\>

> **PublicArkivClient**\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`\> = `Prettify`\<`Client`\<`transport`, `chain`, `accountOrAddress`, `rpcSchema`, `PublicArkivActions`\<`transport`, `chain`\>\>\>

Defined in: [src/clients/createPublicClient.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/clients/createPublicClient.ts#L16)

## Type Parameters

### transport

`transport` *extends* `Transport` = `Transport`

### chain

`chain` *extends* `Chain` \| `undefined` = `Chain` \| `undefined`

### accountOrAddress

`accountOrAddress` *extends* `Account` \| `undefined` = `undefined`

### rpcSchema

`rpcSchema` *extends* `RpcSchema` \| `undefined` = [`ArkivRpcSchema`](ArkivRpcSchema.md)
