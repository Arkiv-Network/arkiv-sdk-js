import { toBytes } from "viem"
import type { Attributes } from "../attr"
// Internal seam: the JSON-RPC decoder is not part of the package's public surface.
import { decodeRpcValue } from "../attr/codec"
import { Entity } from "../types/entity"
import type { RpcEntity } from "../types/rpcSchema"
import { getLogger } from "./logger"

const logger = getLogger("utils:entities")

/**
 * Decodes the attribute array a query returns into a name-keyed map of typed values.
 *
 * Attribute names are unique per entity, so the map loses nothing and gives callers
 * `entity.attributes.level.value` instead of a linear search.
 */
function decodeAttributes(rpcAttributes: RpcEntity["attributes"]): Attributes {
  const attributes: Record<string, ReturnType<typeof decodeRpcValue>> = {}
  for (const { key, value, valueType } of rpcAttributes ?? []) {
    attributes[key] = decodeRpcValue(valueType, value)
  }
  return attributes
}

export async function entityFromRpcResult(rpcEntity: RpcEntity) {
  logger("entityFromRpcResult %o", rpcEntity)

  return new Entity(
    rpcEntity.key,
    rpcEntity.contentType,
    rpcEntity.owner,
    rpcEntity.creator,
    rpcEntity.expiresAt !== undefined ? BigInt(rpcEntity.expiresAt) : undefined,
    rpcEntity.createdAtBlock !== undefined ? BigInt(rpcEntity.createdAtBlock) : undefined,
    rpcEntity.lastModifiedAtBlock !== undefined ? BigInt(rpcEntity.lastModifiedAtBlock) : undefined,
    rpcEntity.transactionIndexInBlock !== undefined
      ? BigInt(rpcEntity.transactionIndexInBlock)
      : undefined,
    rpcEntity.operationIndexInTransaction !== undefined
      ? BigInt(rpcEntity.operationIndexInTransaction)
      : undefined,
    rpcEntity.value !== undefined ? toBytes(rpcEntity.value) : undefined,
    decodeAttributes(rpcEntity.attributes),
  )
}
