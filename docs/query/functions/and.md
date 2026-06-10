[**@arkiv-network/sdk v0.7.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / and

# Function: and()

> **and**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:41](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93f71e95a1695ad42eaf88334075c9818f1413e3/src/query/predicate.ts#L41)

Creates an AND predicate

## Parameters

### predicates

[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to combine

## Returns

[`Predicate`](../type-aliases/Predicate.md)

The AND predicate

## Example

```ts
const predicates = [eq("name", "John"), eq("age", 30)]
const result = and(predicates)
// result = { type: "and", predicates: [eq("name", "John"), eq("age", 30)] }
```
