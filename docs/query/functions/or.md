[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / or

# Function: or()

## Call Signature

> **or**(`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/predicate.ts#L26)

Creates an OR predicate

### Parameters

#### predicates

[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to combine, either as a single array or as separate arguments

### Returns

[`Predicate`](../type-aliases/Predicate.md)

The OR predicate

### Example

```ts
const result = or(eq("name", "John"), eq("age", 30))
// or equivalently: or([eq("name", "John"), eq("age", 30)])
// result = { type: "or", predicates: [eq("name", "John"), eq("age", 30)] }
```

## Call Signature

> **or**(...`predicates`): [`Predicate`](../type-aliases/Predicate.md)

Defined in: [src/query/predicate.ts:27](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/predicate.ts#L27)

Creates an OR predicate

### Parameters

#### predicates

...[`Predicate`](../type-aliases/Predicate.md)[]

The predicates to combine, either as a single array or as separate arguments

### Returns

[`Predicate`](../type-aliases/Predicate.md)

The OR predicate

### Example

```ts
const result = or(eq("name", "John"), eq("age", 30))
// or equivalently: or([eq("name", "John"), eq("age", 30)])
// result = { type: "or", predicates: [eq("name", "John"), eq("age", 30)] }
```
