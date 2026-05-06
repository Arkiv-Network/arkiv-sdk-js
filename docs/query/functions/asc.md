[**@arkiv-network/sdk v0.6.6**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / asc

# Function: asc()

> **asc**(`attributeName`, `attributeType`): [`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Defined in: [src/query/queryBuilder.ts:24](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f1df6a3246e47d0aee10852c916765440d17dc25/src/query/queryBuilder.ts#L24)

Helper function to create an ascending order by attribute

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
const ascAttribute = asc("name", "string")
```
