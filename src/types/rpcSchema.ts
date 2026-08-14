import type { Hex, PublicRpcSchema } from "viem"

/**
 * An attribute as the node renders it: the name, the type **tag** (not the wire typeId), and the
 * value in the JSON encoding that type prescribes — a JSON number for `i32`, a `0x` QUANTITY for
 * `u64` and `u256`, a decimal string for `dec`, `0x` DATA for the byte-shaped types, and a string for
 * `str`.
 *
 * The encoding follows the *declared type*, never the magnitude, so a decoder dispatches on `type`
 * and never has to guess from the shape of the value.
 */
export type RpcAttribute = {
  name: string
  type: string
  value: unknown
}

/** An entry of the `attributeSchema` projection — a name and its type, with no value. */
export type RpcAttributeSchemaEntry = {
  name: string
  type: string
}

/**
 * The `creationFlags` projection.
 */
export type RpcCreationFlags = {
  readonly?: boolean
  permissionlessExtension?: boolean
  raw: number
}

/**
 * An entity as `arkiv_query` returns it. Every field is present only if it was selected, so all of
 * them are optional here — {@link RpcSelect} is what decides which arrive.
 */
export type RpcEntity = {
  key?: Hex
  owner?: Hex
  creator?: Hex
  createdAt?: Hex
  updatedAt?: Hex
  expiresAt?: Hex
  creationFlags?: RpcCreationFlags | number
  contentType?: string
  payload?: Hex
  attributeSchema?: RpcAttributeSchemaEntry[]
  attributes?: RpcAttribute[]
}

/**
 * The `select` projection: flat, per-field booleans. Everything except `key` defaults to **off**,
 * so a query asks for exactly what it needs and nothing more.
 *
 * `attributes` is the one field with a third form: `true` for every attribute, or a map of names
 * for a subset.
 */
export type RpcSelect = {
  key?: boolean
  owner?: boolean
  creator?: boolean
  createdAt?: boolean
  updatedAt?: boolean
  expiresAt?: boolean
  creationFlags?: boolean
  contentType?: boolean
  payload?: boolean
  attributeSchema?: boolean
  attributes?: boolean | Record<string, boolean>
}

export type RpcQueryOptions = {
  /** Block height to read at, as a hex quantity. Defaults to the head, and must be within the node's retained range. */
  atBlock?: Hex
  /** What to return. Defaults to `{ key: true }`. */
  select?: RpcSelect
  /** Page size, as a hex quantity. Node maximum is 200. */
  limit?: Hex
  /** Opaque cursor from a previous response; bound to that query, block and selection. */
  cursor?: string
}

export type ArkivRpcSchema = [
  {
    Method: "arkiv_query"
    Parameters?: [query: string, queryOptions?: RpcQueryOptions]
    ReturnType: {
      data: RpcEntity[]
      blockNumber: Hex
      /** Omitted when no pages remain. */
      cursor?: string
    }
  },
  {
    Method: "arkiv_getBlockTiming"
    Parameters?: []
    ReturnType: {
      current_block: bigint
      current_block_time: number
      duration: number
    }
  },
  {
    Method: "arkiv_getEntityCount"
    Parameters?: []
    ReturnType: number
  },
]

export type PublicArkivRpcSchema = [...PublicRpcSchema, ...ArkivRpcSchema]
