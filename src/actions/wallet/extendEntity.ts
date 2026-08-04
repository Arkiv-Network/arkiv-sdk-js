import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Expiry } from "../../entity"
import type { TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:extend-entity")

/**
 * Parameters for extending an entity's life.
 *
 * An extension **sets a new expiry**; it does not add to the existing one. It is resolved exactly
 * as a create's is — a duration counts from now, not from the entity's current expiry — so
 * `ExpirationTime.fromDays(30)` means "alive for thirty more days from now" whatever the entity's
 * remaining life happened to be.
 *
 * The engine rejects an extension that would not move the expiry later, so extending an entity by
 * less than it already has left is an error rather than a silent shortening.
 *
 * @example
 * await client.extendEntity({ entityKey, expires: ExpirationTime.fromDays(30) })
 * await client.extendEntity({ entityKey, expires: ExpirationTime.atBlock(1_200_000n) })
 */
export type ExtendEntityParameters = {
  entityKey: Hex
  /** The entity's new lifetime, built with {@link ExpirationTime}. */
  expires: Expiry
}

/**
 * The result of extending an entity.
 */
export type ExtendEntityReturnType = {
  entityKey: Hex
  txHash: Hash
  /**
   * The block the entity is now expected to expire at, resolved against the block the transaction
   * was built on. Durations are approximate, so treat this as the estimate the operation was built
   * from rather than the block the engine settled on.
   */
  expiresAt: bigint
}

export async function extendEntity(
  client: ArkivClient,
  data: ExtendEntityParameters,
  txParams?: TxParams,
): Promise<ExtendEntityReturnType> {
  logger("extendEntity %o", data)
  const { receipt, extendedExpiries } = await sendArkivTransaction(
    client,
    { extensions: [data] },
    txParams,
  )

  logger("Receipt from extendEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey: data.entityKey,
    expiresAt: extendedExpiries[0],
  }
}
