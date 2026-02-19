[**@arkiv-network/sdk v0.6.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / desc

# Function: desc()

> **desc**(`attributeName`, `attributeType`): [`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Defined in: [src/query/queryBuilder.ts:41](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/2ea409e4a615ac295234b8ab33be508f9a65f324/src/query/queryBuilder.ts#L41)

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

## Example

```ts
const descAttribute = desc("name", "string")
```
