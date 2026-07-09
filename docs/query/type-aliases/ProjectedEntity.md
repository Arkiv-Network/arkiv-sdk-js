[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / ProjectedEntity

# Type Alias: ProjectedEntity\<S\>

> **ProjectedEntity**\<`S`\> = `{ readonly [K in keyof S as S[K] extends true ? K : never]: K extends keyof Entity ? NonNullable<Entity[K]> : never }` & `S` *extends* `object` ? `Pick`\<[`Entity`](../../main/interfaces/Entity.md), `"toText"` \| `"toJson"`\> : `unknown`

Defined in: [src/query/selection.ts:50](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/selection.ts#L50)

The result of a selection `S`: an [Entity](../../main/interfaces/Entity.md) narrowed to exactly the selected fields (each
non-`undefined`). The shape is flat and backwards compatible — e.g. `select({ owner: true })`
yields `{ owner: Hex }` accessed as `entity.owner`. Accessing an unselected field is a compile
error.

The `toText()` / `toJson()` helpers operate on the payload, so they are only present when
`payload` was selected — calling them otherwise would always throw.

## Type Parameters

### S

`S`
