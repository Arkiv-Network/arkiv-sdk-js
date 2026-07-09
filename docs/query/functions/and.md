[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / and

# Function: and()

## Call Signature

> **and**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:43](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/predicate.ts#L43)

Creates an AND predicate

### Parameters

#### predicates

[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to combine, either as a single array or as separate arguments

### Returns

[`Predicate`](../type-aliases/Predicate.md)

The AND predicate

### Example

```ts
const result = and(eq("name", "John"), eq("age", 30))
// or equivalently: and([eq("name", "John"), eq("age", 30)])
// result = { type: "and", predicates: [eq("name", "John"), eq("age", 30)] }
```

## Call Signature

> **and**(...`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:44](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/predicate.ts#L44)

Creates an AND predicate

### Parameters

#### predicates

...[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to combine, either as a single array or as separate arguments

### Returns

[`Predicate`](../type-aliases/Predicate.md)

The AND predicate

### Example

```ts
const result = and(eq("name", "John"), eq("age", 30))
// or equivalently: and([eq("name", "John"), eq("age", 30)])
// result = { type: "and", predicates: [eq("name", "John"), eq("age", 30)] }
```
