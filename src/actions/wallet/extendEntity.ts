import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:extend-entity")

/**
 * Parameters for the extendEntity function.
 * - entityKey: The key of the entity to extend.
 * - expiresIn: The expires in of the entity in seconds.
 */
export type ExtendEntityParameters = {
  entityKey: Hex
  expiresIn: number
}

/**
 * Return type for the extendEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type ExtendEntityReturnType = {
  entityKey: Hex
  txHash: Hash
}

export async function extendEntity(
  client: ArkivClient,
  data: ExtendEntityParameters,
  txParams?: TxParams,
): Promise<ExtendEntityReturnType> {
  logger("extendEntity %o", data)
  const txData = opsToTxData({ extensions: [data] })
  const receipt = await sendArkivTransaction(client, txData, txParams)

  logger("Receipt from extendEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey: receipt.logs[0].topics[1] as Hex,
  }
}
