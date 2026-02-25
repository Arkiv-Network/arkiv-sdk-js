[**@arkiv-network/sdk v0.6.1**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / gte

# Function: gte()

> **gte**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:97](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/c260e07488c8d139ede2633208b0eec1ee0b9713/src/query/predicate.ts#L97)

Creates a greater than or equal predicate

## Parameters

### key

`string`

The key to compare

### value

The value to compare

`string` | `number`

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The greater than or equal predicate

## Example

```ts
const predicate = gte("name", "John")
// result = { type: "gte", key: "name", value: "John" }
```
