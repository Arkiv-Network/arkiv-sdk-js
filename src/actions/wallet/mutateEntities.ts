import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { type EntityMutationOps, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:mutate-entities")

/**
 * Parameters for the mutateEntities function — the same batch shape the advanced path takes
 * ({@link EntityMutationOps}), so the two surfaces cannot drift apart.
 *
 * At least one operation is required; a batch with nothing in it throws rather than spending gas on
 * an empty transaction.
 */
export type MutateEntitiesParameters = EntityMutationOps

/** Return type for the mutateEntities function. */
export type MutateEntitiesReturnType = {
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

export async function mutateEntities(
  client: ArkivClient,
  data: MutateEntitiesParameters,
  txParams?: TxParams,
): Promise<MutateEntitiesReturnType> {
  const { receipt, createdEntityKeys } = await sendArkivTransaction(client, data, txParams)

  logger("Receipt from mutateEntities %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    createdEntities: createdEntityKeys,
    patchedEntities: (data.patches ?? []).map((p) => p.entityKey),
    deletedEntities: (data.deletes ?? []).map((d) => d.entityKey),
    extendedEntities: (data.extensions ?? []).map((e) => e.entityKey),
    ownershipChanges: (data.ownershipChanges ?? []).map((o) => o.entityKey),
  }
}
