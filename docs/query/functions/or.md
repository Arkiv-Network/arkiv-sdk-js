[**@arkiv-network/sdk v0.6.7**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / or

# Function: or()

> **or**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/43e079f620d2ee06236e15bdaccf1497199dca0b/src/query/predicate.ts#L26)

Creates an OR predicate

## Parameters

### predicates

[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to combine

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The OR predicate

## Example

```ts
const predicates = [eq("name", "John"), eq("age", 30)]
const result = or(predicates)
// result = { type: "or", predicates: [eq("name", "John"), eq("age", 30)] }
```
