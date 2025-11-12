import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:delete-entity")

/**
 * Parameters for the deleteEntity function.
 * - entityKey: The key of the entity to delete.
 */
export type DeleteEntityParameters = {
  entityKey: Hex
}

/**
 * Return type for the deleteEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type DeleteEntityReturnType = {
  entityKey: Hex
  txHash: Hash
}

export async function deleteEntity(
  client: ArkivClient,
  data: DeleteEntityParameters,
  txParams?: TxParams,
): Promise<DeleteEntityReturnType> {
  logger("deleteEntity %o", data)
  const txData = opsToTxData({ deletes: [data] })
  const receipt = await sendArkivTransaction(client, txData, txParams)

  logger("Receipt from deleteEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey: data.entityKey,
  }
}
