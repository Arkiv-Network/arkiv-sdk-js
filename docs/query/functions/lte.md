[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / lte

# Function: lte()

> **lte**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:125](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/predicate.ts#L125)

Creates a less than or equal predicate

## Parameters

### key

`string`

The key to compare

### value

The value to compare

`string` | `number`

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The less than or equal predicate

## Example

```ts
const predicate = lte("name", "John")
// result = { type: "lte", key: "name", value: "John" }
```
