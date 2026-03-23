[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [query/predicate](../index.md) / lte

# Function: lte()

> **lte**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:125](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/predicate.ts#L125)

Creates a less than or equal predicate

## Parameters

### key

`string`

The key to compare

### value

`string` \| `number`

The value to compare

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The less than or equal predicate

## Example

```ts
const predicate = lte("name", "John")
// result = { type: "lte", key: "name", value: "John" }
```
