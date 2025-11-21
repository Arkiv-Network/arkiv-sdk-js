[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / asc

# Function: asc()

> **asc**(`attributeName`, `attributeType`): [`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Defined in: [src/query/queryBuilder.ts:24](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/query/queryBuilder.ts#L24)

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
