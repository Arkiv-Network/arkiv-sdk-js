[**@arkiv-network/sdk v0.6.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / lt

# Function: lt()

> **lt**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:111](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/2ea409e4a615ac295234b8ab33be508f9a65f324/src/query/predicate.ts#L111)

Creates a less than predicate

## Parameters

### key

`string`

The key to compare

### value

The value to compare

`string` | `number`

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The less than predicate

## Example

```ts
const predicate = lt("name", "John")
// result = { type: "lt", key: "name", value: "John" }
```
