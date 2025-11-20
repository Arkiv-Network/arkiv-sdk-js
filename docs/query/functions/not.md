[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / not

# Function: not()

> **not**(`key`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:138](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/predicate.ts#L138)

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
