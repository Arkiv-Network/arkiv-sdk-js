[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / not

# Function: not()

> **not**(`key`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:142](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/predicate.ts#L142)

Creates a not predicate

## Parameters

### key

`string`

The key to compare

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The not predicate

## Example

```ts
const predicate = not("name")
// result = { type: "not", key: "name", value: "" }
```
