[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / desc

# ~~Function: desc()~~

> **desc**(`attributeName`, `attributeType`): [`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Defined in: [src/query/queryBuilder.ts:56](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/queryBuilder.ts#L56)

Helper function to create a descending order by attribute

## Parameters

### attributeName

`string`

The name of the attribute to order by

### attributeType

The type of the attribute to order by (string or number)

`"string"` | `"number"`

## Returns

[`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Input for orderBy method

## Deprecated

Server-side ordering is not supported by the network, so `orderBy` (and this
helper) have no effect on the returned order. Sort the fetched entities in JavaScript
instead (e.g. `entities.sort(...)`). This function will be removed in a future release.

## Example

```ts
const descAttribute = desc("name", "string")
```
