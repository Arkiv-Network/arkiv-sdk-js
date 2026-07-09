[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / CreateEntityParameters

# Type Alias: CreateEntityParameters

> **CreateEntityParameters** = `object`

Defined in: [src/actions/wallet/createEntity.ts:23](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/createEntity.ts#L23)

Parameters for the createEntity function.
- payload: The payload of the entity.
- attributes: The attributes of the entity. Attribute values may be strings
  or numbers, but numeric values **must be integers**. To store a non-integer,
  scale it to an integer (e.g. `1.5` -> `1500`) to preserve numeric ordering,
  or pass it as a string (e.g. `"1.5"`). A non-integer numeric value throws an
  [InvalidAttributeError](../classes/InvalidAttributeError.md).
- contentType: The content type of the entity.
- expiresIn: How long until the entity expires, in seconds. Because Arkiv
  measures expiration in blocks (1 block = 2 seconds), this **must be a
  positive integer and a multiple of the block time (2 seconds)**
  Invalid values throw an [InvalidExpirationError](../classes/InvalidExpirationError.md).

## Properties

### attributes

> **attributes**: [`Attribute`](Attribute.md)[]

Defined in: [src/actions/wallet/createEntity.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/createEntity.ts#L26)

Entity attributes. Numeric values must be integers (scale non-integers, e.g. `1.5` -> `1500`, or use a string). Throws [InvalidAttributeError](../classes/InvalidAttributeError.md) otherwise.

***

### contentType

> **contentType**: [`MimeType`](MimeType.md) \| `string`

Defined in: [src/actions/wallet/createEntity.ts:27](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/createEntity.ts#L27)

***

### expiresIn

> **expiresIn**: `number`

Defined in: [src/actions/wallet/createEntity.ts:30](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/createEntity.ts#L30)

Seconds until expiry. Must be a positive integer and a multiple of the 2s block time.
Throws [InvalidExpirationError](../classes/InvalidExpirationError.md) otherwise.

***

### payload

> **payload**: `Uint8Array`

Defined in: [src/actions/wallet/createEntity.ts:24](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/createEntity.ts#L24)
