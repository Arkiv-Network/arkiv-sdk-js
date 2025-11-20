[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / or

# Function: or()

> **or**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/8543404576ea25f45ae951bdfc73f58bd0f4333b/src/query/predicate.ts#L26)

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
