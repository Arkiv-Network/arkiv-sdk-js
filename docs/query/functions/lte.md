[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / lte

# Function: lte()

> **lte**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:125](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/query/predicate.ts#L125)

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
