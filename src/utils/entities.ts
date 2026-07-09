import { toBytes, type Hex } from "viem"
import type { Attribute } from "../types/attributes"
import { Entity } from "../types/entity"
import type { RpcEntity } from "../types/rpcSchema"
import { RpcAttributeValueType } from "../types/rpcSchema"
import { getLogger } from "./logger"

function decodeAttributeValue(value: string, valueType: RpcAttributeValueType): Attribute["value"] {
  switch (valueType) {
    case RpcAttributeValueType.Uint:
      return Number(BigInt(value as Hex))
    case RpcAttributeValueType.EntityKey:
      return value as Hex
    case RpcAttributeValueType.String:
    default:
      return value
  }
}

const logger = getLogger("utils:entities")

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
    [
      ...(rpcEntity.attributes ?? []).map(({ key, value, valueType }) => ({
        key,
        value: decodeAttributeValue(value, valueType),
      }))
    ],
  )
}
