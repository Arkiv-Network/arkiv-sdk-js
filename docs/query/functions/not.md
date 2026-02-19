[**@arkiv-network/sdk v0.6.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / not

# Function: not()

> **not**(`key`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:138](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/2ea409e4a615ac295234b8ab33be508f9a65f324/src/query/predicate.ts#L138)

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
