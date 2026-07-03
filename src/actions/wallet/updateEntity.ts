import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Attribute, MimeType, TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:update-entity")

/**
 * Parameters for the updateEntity function. An update is a **full replace**,
 * not a patch: the entity's new state is exactly what is passed here, so every
 * field is required. To change only some fields and keep the rest, use
 * patchEntity instead.
 * - entityKey: The key of the entity to update.
 * - payload: The new payload of the entity, replacing the current one.
 * - attributes: The new attributes of the entity, replacing **all** current
 *   ones — any attribute not listed here is removed. Attribute values may be
 *   strings or numbers, but numeric values **must be integers**. To store a
 *   non-integer, scale it to an integer (e.g. `1.5` -> `1500`) to preserve
 *   numeric ordering, or pass it as a string (e.g. `"1.5"`). A non-integer
 *   numeric value throws an {@link InvalidAttributeError}.
 * - contentType: The new content type of the entity.
 * - expiresIn: How long until the entity expires, in seconds, replacing the
 *   current expiration. Because Arkiv measures expiration in blocks (1 block =
 *   2 seconds), this **must be a positive integer and a multiple of the block
 *   time (2 seconds)**. Invalid values throw an {@link InvalidExpirationError}.
 */
export type UpdateEntityParameters = {
  entityKey: Hex
  /** New payload, replacing the current one. */
  payload: Uint8Array
  /** New attributes, replacing **all** current ones — attributes not listed here are
   * removed. Numeric values must be integers (scale non-integers, e.g. `1.5` -> `1500`,
   * or use a string). Throws {@link InvalidAttributeError} otherwise. */
  attributes: Attribute[]
  /** New content type, replacing the current one. */
  contentType: MimeType | string
  /** Seconds until expiry, replacing the current expiration. Must be a positive integer
   * and a multiple of the 2s block time. Throws {@link InvalidExpirationError} otherwise. */
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

/**
 * Replaces an entity's state wholesale with the provided parameters. This is
 * a **full replace, not a patch**: the payload, content type and expiration
 * are overwritten, and the attribute set becomes exactly the provided list —
 * attributes not listed are removed. To change only some fields and keep the
 * rest, use patchEntity.
 */
export async function updateEntity(
  client: ArkivClient,
  data: UpdateEntityParameters,
  txParams?: TxParams,
): Promise<UpdateEntityReturnType> {
  logger("updateEntity %o", data)
  const txData = opsToTxData({ updates: [data] })
  const receipt = await sendArkivTransaction(client, txData, txParams)

  logger("Receipt from updateEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    // fall back to the requested key when the receipt carries no parseable log
    entityKey: (receipt.logs[0]?.topics[1] as Hex | undefined) ?? data.entityKey,
  }
}
