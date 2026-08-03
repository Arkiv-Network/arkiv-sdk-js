import type { Hash, Hex } from "viem"
import type { AttributeInputs } from "../../attr"
import type { ArkivClient } from "../../clients/baseClient"
import type { MimeType, TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:create-entity")

/**
 * Parameters for the createEntity function.
 *
 * @example
 * await client.createEntity({
 *   attributes: {
 *     level:   i32(10),
 *     balance: u256(1_000_000n),
 *     score:   dec("3.5"),
 *     name:    "Bob",   // bare string -> str
 *     flagged: true,    // bare boolean -> bool
 *   },
 *   payload: jsonToPayload({ hello: "world" }),
 *   contentType: "application/json",
 *   expiresIn: 3600,
 * })
 */
export type CreateEntityParameters = {
  /** The entity's opaque payload. */
  payload: Uint8Array
  /**
   * The entity's queryable attributes, keyed by name. Values are the tagged constructors from
   * `@arkiv-network/sdk/attr` — `i32`, `u256`, `dec`, `str`, `addr`, `key`, `bytes32`, `bool` —
   * or a bare `boolean`, `number`, `bigint` or `string` where the type is unambiguous.
   *
   * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
   * @throws {InvalidValueError} If a value does not fit the type it names or defaults to.
   */
  attributes?: AttributeInputs
  contentType: MimeType | string
  /** Seconds until expiry. Must be a positive integer and a multiple of the 2s block time.
   * Throws {@link InvalidExpirationError} otherwise. */
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
