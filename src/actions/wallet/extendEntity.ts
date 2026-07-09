import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:extend-entity")

/**
 * Parameters for the extendEntity function.
 * - entityKey: The key of the entity to extend.
 * - expiresIn: How long to extend the entity by, in seconds. Because Arkiv
 *   measures expiration in blocks (1 block = 2 seconds), this **must be a
 *   positive integer and a multiple of the block time (2 seconds)**.
 *   Invalid values throw an {@link InvalidExpirationError}.
 */
export type ExtendEntityParameters = {
  entityKey: Hex
  /** Seconds to extend by. Must be a positive integer and a multiple of the 2s block time.
   * Throws {@link InvalidExpirationError} otherwise. */
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
