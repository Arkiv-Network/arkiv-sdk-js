[**@arkiv-network/sdk v0.7.0**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [query](../index.md) / selectionToIncludeData

# Function: selectionToIncludeData()

> **selectionToIncludeData**(`selection?`): [`RpcIncludeData`](../../main/type-aliases/RpcIncludeData.md)

Defined in: [src/query/selection.ts:77](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/7e73d8f472c0b915dd47354518502478fa38bac5/src/query/selection.ts#L77)

Converts a [SelectArg](../type-aliases/SelectArg.md) into the [RpcIncludeData](../../main/type-aliases/RpcIncludeData.md) understood by the query engine.
Every field is opt-in — anything not explicitly selected defaults to `false`, including the key.
`undefined` or `"*"` selects everything.

## Parameters

### selection?

The selection to convert

`"*"` | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"key"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"key"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"contentType"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"contentType"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"owner"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"owner"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"creator"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"creator"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"expiresAtBlock"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"expiresAtBlock"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"createdAtBlock"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"createdAtBlock"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"lastModifiedAtBlock"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"lastModifiedAtBlock"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"transactionIndexInBlock"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"transactionIndexInBlock"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"operationIndexInTransaction"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"operationIndexInTransaction"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"attributes"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"attributes"`\>\> | `Required`\<`Pick`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"payload"`\>\> & `Partial`\<`Omit`\<[`SelectionFields`](../type-aliases/SelectionFields.md), `"payload"`\>\>

## Returns

[`RpcIncludeData`](../../main/type-aliases/RpcIncludeData.md)

The fully-resolved include-data object for the RPC query

## Throws

If an empty selection object is provided

## Example

```ts
selectionToIncludeData() // everything
selectionToIncludeData("*") // everything
selectionToIncludeData({ key: true }) // only the key
selectionToIncludeData({ owner: true }) // only the owner
```
