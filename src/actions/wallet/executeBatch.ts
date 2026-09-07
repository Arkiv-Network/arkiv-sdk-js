import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"
import type { ChangeOwnershipParameters } from "./changeOwnership"
import type { CreateEntityParameters } from "./createEntity"
import type { DeleteEntityParameters } from "./deleteEntity"
import type { ExtendEntityParameters } from "./extendEntity"
import type { PatchEntityParameters } from "./patchEntity"

const logger = getLogger("actions:wallet:execute-batch")

/**
 * Parameters for the executeBatch function.
 *
 * At least one operation is required; a batch with nothing in it throws rather than spending gas on
 * an empty transaction.
 */
export type ExecuteBatchParameters = {
  /** The entities to create. */
  creates?: CreateEntityParameters[]
  /** The patches to apply. */
  patches?: PatchEntityParameters[]
  /** The entities to delete. */
  deletes?: DeleteEntityParameters[]
  /** The expiries to set. */
  extensions?: ExtendEntityParameters[]
  /** The ownership transfers to perform. */
  ownershipChanges?: ChangeOwnershipParameters[]
}

/** Return type for the executeBatch function. */
export type ExecuteBatchReturnType = {
  /** The transaction hash. */
  txHash: Hash
  /** The keys of the created entities, in batch order. */
  createdEntities: Hex[]
  /** The keys of the patched entities. */
  patchedEntities: Hex[]
  /** The keys of the deleted entities. */
  deletedEntities: Hex[]
  /** The keys of the extended entities. */
  extendedEntities: Hex[]
  /** The keys of the entities handed to a new owner. */
  ownershipChanges: Hex[]
}

export async function executeBatch(
  client: ArkivClient,
  data: ExecuteBatchParameters,
  txParams?: TxParams,
): Promise<ExecuteBatchReturnType> {
  const { receipt, createdEntityKeys } = await sendArkivTransaction(client, data, txParams)

  logger("Receipt from executeBatch %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    createdEntities: createdEntityKeys,
    patchedEntities: (data.patches ?? []).map((p) => p.entityKey),
    deletedEntities: (data.deletes ?? []).map((d) => d.entityKey),
    extendedEntities: (data.extensions ?? []).map((e) => e.entityKey),
    ownershipChanges: (data.ownershipChanges ?? []).map((o) => o.entityKey),
  }
}
