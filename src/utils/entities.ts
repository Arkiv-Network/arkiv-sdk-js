import { toBytes } from "viem"
import { Entity } from "../types/entity"
import type { RpcEntity } from "../types/rpcSchema"
import { getLogger } from "./logger"

const logger = getLogger("utils:entities")

export async function entityFromRpcResult(rpcEntity: RpcEntity) {
  logger("entityFromRpcResult %o", rpcEntity)

  return new Entity(
    rpcEntity.key,
    rpcEntity.contentType,
    rpcEntity.owner,
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
      ...(rpcEntity.stringAttributes ?? []).map(({ key, value }) => ({
        key,
        value,
      })),
      ...(rpcEntity.numericAttributes ?? []).map(({ key, value }) => ({
        key,
        value: Number(value),
      })),
    ],
  )
}
