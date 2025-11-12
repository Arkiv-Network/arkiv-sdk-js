import { toBytes } from "viem"
import { Entity } from "../types/entity"
import type { RpcEntity } from "../types/rpcSchema"

export async function entityFromRpcResult(rpcEntity: RpcEntity) {
  return new Entity(
    rpcEntity.key,
    rpcEntity.contentType,
    rpcEntity.owner,
    rpcEntity.expiresAt ? BigInt(rpcEntity.expiresAt) : undefined,
    rpcEntity.createdAtBlock ? BigInt(rpcEntity.createdAtBlock) : undefined,
    rpcEntity.lastModifiedAtBlock ? BigInt(rpcEntity.lastModifiedAtBlock) : undefined,
    rpcEntity.transactionIndexInBlock ? BigInt(rpcEntity.transactionIndexInBlock) : undefined,
    rpcEntity.operationIndexInTransaction
      ? BigInt(rpcEntity.operationIndexInTransaction)
      : undefined,
    rpcEntity.value ? toBytes(rpcEntity.value) : undefined,
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
