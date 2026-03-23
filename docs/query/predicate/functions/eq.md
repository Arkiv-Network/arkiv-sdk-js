[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [query/predicate](../index.md) / eq

# Function: eq()

> **eq**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:55](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/predicate.ts#L55)

Creates an equality predicate

## Parameters

### key

`string`

The key to compare

### value

`string` \| `number`

The value to compare

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The equality predicate

## Example

```ts
const predicate = eq("name", "John")
// result = { type: "eq", key: "name", value: "John" }
```
