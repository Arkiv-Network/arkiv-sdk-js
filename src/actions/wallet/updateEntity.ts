import type { Hash, Hex } from "viem"
import type { AttributeInputs } from "../../attr"
import type { ArkivClient } from "../../clients/baseClient"
import type { MimeType, TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:update-entity")

/**
 * Parameters for the updateEntity function.
 *
 * An update **replaces** the entity's attributes rather than merging into them: whatever is not in
 * `attributes` is gone afterwards.
 */
export type UpdateEntityParameters = {
  entityKey: Hex
  /** The entity's opaque payload. */
  payload: Uint8Array
  /**
   * The entity's queryable attributes, keyed by name. Values are the tagged constructors from
   * `@arkiv-network/sdk/attr` — `i32`, `u256`, `dec`, `str`, `addr`, `key`, `bytes32`, `bool` —
   * or a bare `boolean`, `number`, `bigint` or `string` where the type is unambiguous.
   *
   * **Required, and required on purpose.** An update replaces the attribute set wholesale, so an
   * omitted `attributes` would silently delete every attribute on the entity — including ones
   * this caller never knew about. Pass `{}` if erasing them is what you mean; otherwise read the
   * entity first and pass the attributes you want it to end up with.
   *
   * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
   * @throws {InvalidValueError} If a value does not fit the type it names or defaults to.
   */
  attributes: AttributeInputs
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
