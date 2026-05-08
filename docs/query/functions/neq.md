[**@arkiv-network/sdk v0.6.7**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / neq

# Function: neq()

> **neq**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:69](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/43e079f620d2ee06236e15bdaccf1497199dca0b/src/query/predicate.ts#L69)

Creates a not equal predicate

## Parameters

### key

`string`

The key to compare

### value

The value to compare

`string` | `number`

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The not equal predicate

## Example

```ts
const predicate = neq("name", "John")
// result = { type: "neq", key: "name", value: "John" }
```
