[**@arkiv-network/sdk v0.5.0-dev.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / asc

# Function: asc()

> **asc**(`attributeName`, `attributeType`): `OrderByAttribute`

Defined in: [src/query/queryBuilder.ts:24](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/1e6e55bb53c059d98903266b2217853ca4cf62b3/src/query/queryBuilder.ts#L24)

Helper function to create an ascending order by attribute

## Parameters

### attributeName

`string`

The name of the attribute to order by

### attributeType

The type of the attribute to order by (string or number)

`"string"` | `"number"`

## Returns

`OrderByAttribute`

The OrderByAttribute instance

## Example

```ts
const ascAttribute = asc("name", "string")
```
