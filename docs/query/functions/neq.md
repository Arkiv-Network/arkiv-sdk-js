[**@arkiv-network/sdk v0.6.6**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / neq

# Function: neq()

> **neq**(`key`, `value`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:69](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f1df6a3246e47d0aee10852c916765440d17dc25/src/query/predicate.ts#L69)

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
