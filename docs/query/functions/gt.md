[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / gt

# Function: gt()

> **gt**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:83](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/predicate.ts#L83)

Creates a greater than predicate

## Parameters

### key

`string`

The key to compare

### value

The value to compare

`string` | `number`

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The greater than predicate

## Example

```ts
const predicate = gt("name", "John")
// result = { type: "gt", key: "name", value: "John" }
```
