[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [types/entity](../index.md) / Entity

# Class: Entity

Defined in: [src/types/entity.ts:5](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L5)

## Constructors

### Constructor

> **new Entity**(`key`, `contentType?`, `owner?`, `creator?`, `expiresAtBlock?`, `createdAtBlock?`, `lastModifiedAtBlock?`, `transactionIndexInBlock?`, `operationIndexInTransaction?`, `payload?`, `attributes`): `Entity`

Defined in: [src/types/entity.ts:18](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L18)

#### Parameters

##### key

`` `0x${string}` ``

##### contentType?

[`MimeType`](../../mimeTypes/type-aliases/MimeType.md) \| `undefined`

##### owner?

`` `0x${string}` `` \| `undefined`

##### creator?

`` `0x${string}` `` \| `undefined`

##### expiresAtBlock?

`bigint` \| `undefined`

##### createdAtBlock?

`bigint` \| `undefined`

##### lastModifiedAtBlock?

`bigint` \| `undefined`

##### transactionIndexInBlock?

`bigint` \| `undefined`

##### operationIndexInTransaction?

`bigint` \| `undefined`

##### payload?

`Uint8Array`\<`ArrayBufferLike`\> \| `undefined`

##### attributes

[`Attribute`](../../attributes/type-aliases/Attribute.md)[]

#### Returns

`Entity`

## Properties

### attributes

> **attributes**: [`Attribute`](../../attributes/type-aliases/Attribute.md)[]

Defined in: [src/types/entity.ts:16](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L16)

***

### contentType

> **contentType**: [`MimeType`](../../mimeTypes/type-aliases/MimeType.md) \| `undefined`

Defined in: [src/types/entity.ts:7](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L7)

***

### createdAtBlock

> **createdAtBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:11](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L11)

***

### creator

> **creator**: `` `0x${string}` `` \| `undefined`

Defined in: [src/types/entity.ts:9](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L9)

***

### expiresAtBlock

> **expiresAtBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:10](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L10)

***

### key

> **key**: `` `0x${string}` ``

Defined in: [src/types/entity.ts:6](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L6)

***

### lastModifiedAtBlock

> **lastModifiedAtBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:12](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L12)

***

### operationIndexInTransaction

> **operationIndexInTransaction**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:14](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L14)

***

### owner

> **owner**: `` `0x${string}` `` \| `undefined`

Defined in: [src/types/entity.ts:8](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L8)

***

### payload

> **payload**: `Uint8Array`\<`ArrayBufferLike`\> \| `undefined`

Defined in: [src/types/entity.ts:15](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L15)

***

### transactionIndexInBlock

> **transactionIndexInBlock**: `bigint` \| `undefined`

Defined in: [src/types/entity.ts:13](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L13)

## Methods

### toJson()

> **toJson**(): `any`

Defined in: [src/types/entity.ts:72](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L72)

Parses the entity payload as JSON and returns the resulting object.
Throws an error if the payload is undefined, which may occur if the entity was not queried with the withPayload option.
Throws an error if the payload is empty or cannot be parsed as JSON.

#### Returns

`any`

The parsed JSON object from the entity payload.

***

### toText()

> **toText**(): `string`

Defined in: [src/types/entity.ts:50](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/types/entity.ts#L50)

Converts the entity payload from bytes to a string and returns it.
Throws an error if the payload is undefined, which may occur if the entity was not queried with the withPayload option.
Throws an error if the conversion from bytes to string fails.

#### Returns

`string`

The entity payload as a string.
