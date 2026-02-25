[**@arkiv-network/sdk v0.6.2**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / or

# Function: or()

> **or**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/query/predicate.ts#L26)

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
