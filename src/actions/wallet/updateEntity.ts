import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Attribute, MimeType, TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:update-entity")

/**
 * Parameters for the updateEntity function.
 * - entityKey: The key of the entity to update.
 * - payload: The payload of the entity.
 * - attributes: The attributes of the entity. Attribute values may be strings
 *   or numbers, but numeric values **must be integers**. To store a non-integer,
 *   scale it to an integer (e.g. `1.5` -> `1500`) to preserve numeric ordering,
 *   or pass it as a string (e.g. `"1.5"`). A non-integer numeric value throws an
 *   {@link InvalidAttributeError}.
 * - contentType: The content type of the entity.
 * - expiresIn: How long until the entity expires, in seconds. Because Arkiv
 *   measures expiration in blocks (1 block = 2 seconds), this **must be a
 *   positive integer and a multiple of the block time (2 seconds)**.
 *   Invalid values throw an {@link InvalidExpirationError}.
 */
export type UpdateEntityParameters = {
  entityKey: Hex
  payload: Uint8Array
  /** Entity attributes. Numeric values must be integers (scale non-integers, e.g. `1.5` -> `1500`, or use a string). Throws {@link InvalidAttributeError} otherwise. */
  attributes: Attribute[]
  contentType: MimeType | string
  /** Seconds until expiry. Must be a positive integer and a multiple of the 2s block time.
   * Throws {@link InvalidExpirationError} otherwise. */
  expiresIn: number
}

/**
 * Return type for the updateEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type UpdateEntityReturnType = {
  entityKey: Hex
  txHash: Hash
}

export async function updateEntity(
  client: ArkivClient,
  data: UpdateEntityParameters,
  txParams?: TxParams,
): Promise<UpdateEntityReturnType> {
  logger("updateEntity %o", data)
  const { receipt } = await sendArkivTransaction(client, { updates: [data] }, txParams)

  logger("Receipt from updateEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey: data.entityKey,
  }
}
