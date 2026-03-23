[**@arkiv-network/sdk v0.6.5-dev.10**](../../../index.md)

***

[@arkiv-network/sdk](../../../index.md) / [query/queryBuilder](../index.md) / desc

# Function: desc()

> **desc**(`attributeName`, `attributeType`): [`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Defined in: [src/query/queryBuilder.ts:41](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/query/queryBuilder.ts#L41)

Helper function to create a descending order by attribute

## Parameters

### attributeName

`string`

The name of the attribute to order by

### attributeType

`"string"` \| `"number"`

The type of the attribute to order by (string or number)

## Returns

[`OrderByAttribute`](../type-aliases/OrderByAttribute.md)

Input for orderBy method

## Example

```ts
const descAttribute = desc("name", "string")
```
