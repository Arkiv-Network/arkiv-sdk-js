[**@arkiv-network/sdk v0.6.2**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / Entity

# Interface: Entity

Defined in: [src/types/entity.ts:5](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L5)

## Properties

### attributes

> **attributes**: [`Attribute`](../type-aliases/Attribute.md)[]

Defined in: [src/types/entity.ts:15](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L15)

***

### contentType

> **contentType**: [`MimeType`](../type-aliases/MimeType.md) \| `undefined`

Defined in: [src/types/entity.ts:7](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L7)

***

### createdAtBlock

> **createdAtBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:10](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L10)

***

### expiresAtBlock

> **expiresAtBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:9](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L9)

***

### key

> **key**: `` `0x${string}` ``

Defined in: [src/types/entity.ts:6](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L6)

***

### lastModifiedAtBlock

> **lastModifiedAtBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:11](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L11)

***

### operationIndexInTransaction

> **operationIndexInTransaction**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:13](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L13)

***

### owner

> **owner**: `` `0x${string}` `` \| `undefined`

Defined in: [src/types/entity.ts:8](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L8)

***

### payload

> **payload**: `Uint8Array`\<`ArrayBufferLike`\> \| `undefined`

Defined in: [src/types/entity.ts:14](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L14)

***

### transactionIndexInBlock

> **transactionIndexInBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:12](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/types/entity.ts#L12)

## Methods

### toJson()

> **toJson**(): `any`

Defined in: [src/types/entity.ts:72](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/develop/src/types/entity.ts#L72)

#### Returns

`any`

***

### toText()

> **toText**(): `string`

Defined in: [src/types/entity.ts:50](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/develop/src/types/entity.ts#L50)

#### Returns

`string`
