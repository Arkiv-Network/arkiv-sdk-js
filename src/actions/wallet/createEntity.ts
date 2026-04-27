import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Attribute, MimeType, TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:create-entity")

/**
 * Parameters for the createEntity function.
 * - payload: The payload of the entity.
 * - attributes: The attributes of the entity.
 * - contentType: The content type of the entity.
 * - expiresIn: The expires in of the entity in seconds.
 */
export type CreateEntityParameters = {
  payload: Uint8Array
  attributes: Attribute[]
  contentType: MimeType | string
  expiresIn: number
}

/**
 * Return type for the createEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type CreateEntityReturnType = {
  entityKey: Hex
  txHash: Hash
}

export async function createEntity(
  client: ArkivClient,
  data: CreateEntityParameters,
  txParams?: TxParams,
): Promise<CreateEntityReturnType> {
  logger("createEntity %o", data)
  const { receipt, createdEntityKeys } = await sendArkivTransaction(
    client,
    { creates: [data] },
    txParams,
  )

  logger("Receipt from createEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey: createdEntityKeys[0],
  }
}
