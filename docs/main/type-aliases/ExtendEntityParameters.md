[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / ExtendEntityParameters

# Type Alias: ExtendEntityParameters

> **ExtendEntityParameters** = `object`

Defined in: [src/actions/wallet/extendEntity.ts:17](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/extendEntity.ts#L17)

Parameters for the extendEntity function.
- entityKey: The key of the entity to extend.
- expiresIn: How long to extend the entity by, in seconds. Because Arkiv
  measures expiration in blocks (1 block = 2 seconds), this **must be a
  positive integer and a multiple of the block time (2 seconds)**.
  Invalid values throw an [InvalidExpirationError](../classes/InvalidExpirationError.md).

## Properties

### entityKey

> **entityKey**: `Hex`

Defined in: [src/actions/wallet/extendEntity.ts:18](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/extendEntity.ts#L18)

***

### expiresIn

> **expiresIn**: `number`

Defined in: [src/actions/wallet/extendEntity.ts:21](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/wallet/extendEntity.ts#L21)

Seconds to extend by. Must be a positive integer and a multiple of the 2s block time.
Throws [InvalidExpirationError](../classes/InvalidExpirationError.md) otherwise.
