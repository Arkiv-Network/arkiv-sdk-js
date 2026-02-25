[**@arkiv-network/sdk v0.6.1**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / or

# Function: or()

> **or**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/c260e07488c8d139ede2633208b0eec1ee0b9713/src/query/predicate.ts#L26)

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
