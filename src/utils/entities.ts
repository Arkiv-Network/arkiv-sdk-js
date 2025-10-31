import { toBytes } from "viem"
import { Entity } from "../types/entity"
import type { RpcEntity } from "../types/rpcSchema"

export async function entityFromRpcResult(rpcEntity: RpcEntity) {
  return new Entity(
    rpcEntity.key,
    rpcEntity.contentType,
    rpcEntity.owner,
    rpcEntity.expiresAt,
    toBytes(rpcEntity.value),
    [
      ...(rpcEntity.stringAnnotations ?? []).map(({ key, value }) => ({
        key,
        value,
      })),
      ...(rpcEntity.numericAnnotations ?? []).map(({ key, value }) => ({
        key,
        value: value,
      })),
    ],
  )
}
