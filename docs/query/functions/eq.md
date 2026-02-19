[**@arkiv-network/sdk v0.6.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / eq

# Function: eq()

> **eq**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:55](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/2ea409e4a615ac295234b8ab33be508f9a65f324/src/query/predicate.ts#L55)

Creates an equality predicate

## Parameters

### key

`string`

The key to compare

### value

The value to compare

`string` | `number`

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The equality predicate

## Example

```ts
const predicate = eq("name", "John")
// result = { type: "eq", key: "name", value: "John" }
```
