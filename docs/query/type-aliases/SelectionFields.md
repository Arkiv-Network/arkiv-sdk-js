[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / SelectionFields

# Type Alias: SelectionFields

> **SelectionFields** = `{ [K in DataKey]?: boolean }`

Defined in: [src/query/selection.ts:22](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/selection.ts#L22)

The parts of an entity that can be selected. Every field is opt-in (including the `key`) and maps
directly to a field of the returned [Entity](../../main/interfaces/Entity.md) — the selection is flat.
