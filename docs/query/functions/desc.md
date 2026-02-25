[**@arkiv-network/sdk v0.6.2**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / desc

# Function: desc()

> **desc**(`attributeName`, `attributeType`): [`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Defined in: [src/query/queryBuilder.ts:41](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/93d4c0c74e3503d5b045842ef9b11e8553a0c98b/src/query/queryBuilder.ts#L41)

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
