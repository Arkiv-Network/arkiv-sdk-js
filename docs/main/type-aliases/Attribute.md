[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / Attribute

# Type Alias: Attribute

> **Attribute** = `object`

Defined in: [src/types/attributes.ts:12](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/types/attributes.ts#L12)

An entity attribute (key/value pair).

Arkiv supports both string and number values. Numeric values **must be
integers** — passing a non-integer number (e.g. `1.5`) throws an
[InvalidAttributeError](../classes/InvalidAttributeError.md) at mutation time. To store a non-integer value:
- Scale it to an integer (e.g. `1.5` -> `1500`, dividing by the same factor on
  read) to keep numeric ordering and range queries working.
- Or pass it as a string (e.g. `"1.5"`), which sorts lexicographically and so
  does not support numeric comparisons.

## Properties

### key

> **key**: `string`

Defined in: [src/types/attributes.ts:13](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/types/attributes.ts#L13)

***

### value

> **value**: `string` \| `number`

Defined in: [src/types/attributes.ts:15](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/types/attributes.ts#L15)

Attribute value. A `number` must be an integer (scale non-integers, e.g. `1.5` -> `1500`, or use a string). Throws [InvalidAttributeError](../classes/InvalidAttributeError.md) otherwise.
