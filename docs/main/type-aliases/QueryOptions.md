[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / QueryOptions

# Type Alias: QueryOptions

> **QueryOptions** = `object`

Defined in: [src/actions/public/query.ts:23](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/public/query.ts#L23)

## Properties

### atBlock?

> `optional` **atBlock**: `bigint`

Defined in: [src/actions/public/query.ts:25](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/public/query.ts#L25)

***

### cursor?

> `optional` **cursor**: `string`

Defined in: [src/actions/public/query.ts:33](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/public/query.ts#L33)

***

### includeData?

> `optional` **includeData**: [`QueryOptionsIncludeData`](QueryOptionsIncludeData.md)

Defined in: [src/actions/public/query.ts:24](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/public/query.ts#L24)

***

### ~~orderBy?~~

> `optional` **orderBy**: [`QueryOptionsOrderBy`](QueryOptionsOrderBy.md)[]

Defined in: [src/actions/public/query.ts:31](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/public/query.ts#L31)

#### Deprecated

Server-side ordering is not supported by the network, so this option has no
effect on the returned order. Sort the fetched entities in JavaScript instead
(e.g. `entities.sort(...)`). This option will be removed in a future release.

***

### resultsPerPage?

> `optional` **resultsPerPage**: `number`

Defined in: [src/actions/public/query.ts:32](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/actions/public/query.ts#L32)
