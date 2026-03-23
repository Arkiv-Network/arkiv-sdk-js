[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [query/predicate](../index.md) / lt

# Function: lt()

> **lt**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:111](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/predicate.ts#L111)

Creates a less than predicate

## Parameters

### key

`string`

The key to compare

### value

`string` \| `number`

The value to compare

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The less than predicate

## Example

```ts
const predicate = lt("name", "John")
// result = { type: "lt", key: "name", value: "John" }
```
