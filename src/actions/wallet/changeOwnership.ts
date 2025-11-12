import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:change-ownership")

/**
 * Parameters for the deleteEntity function.
 * - entityKey: The key of the entity to delete.
 */
export type ChangeOwnershipParameters = {
  entityKey: Hex
  newOwner: Hex
}

/**
 * Return type for the deleteEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type ChangeOwnershipReturnType = {
  entityKey: Hex
  txHash: string
}

export async function changeOwnership(
  client: ArkivClient,
  data: ChangeOwnershipParameters,
  txParams?: TxParams,
): Promise<ChangeOwnershipReturnType> {
  logger("changeOwnership %o", data)
  const txData = opsToTxData({ ownershipChanges: [data] })
  const receipt = await sendArkivTransaction(client, txData, txParams)

  logger("Receipt from changeOwnership %o", receipt)

  return {
    txHash: receipt.transactionHash,
    entityKey: data.entityKey,
  }
}
