import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"
import type { ChangeOwnershipParameters } from "./changeOwnership"
import type { CreateEntityParameters } from "./createEntity"
import type { DeleteEntityParameters } from "./deleteEntity"
import type { ExtendEntityParameters } from "./extendEntity"
import type { UpdateEntityParameters } from "./updateEntity"

const logger = getLogger("actions:wallet:mutate-entities")

/**
 * Parameters for the mutateEntities function.
 * - creates: The creates to perform.
 * - updates: The updates to perform.
 * - deletes: The deletes to perform.
 * - extensions: The extensions to perform.
 */
export type MutateEntitiesParameters = {
  creates?: CreateEntityParameters[]
  updates?: UpdateEntityParameters[]
  deletes?: DeleteEntityParameters[]
  extensions?: ExtendEntityParameters[]
  ownershipChanges?: ChangeOwnershipParameters[]
}

/**
 * Return type for the mutateEntities function.
 * - txHash: The transaction hash.
 * - createdEntities: The keys of the created entities.
 * - updatedEntities: The keys of the updated entities.
 * - deletedEntities: The keys of the deleted entities.
 * - extendedEntities: The keys of the extended entities.
 * - ownershipChanges: The keys of the ownership changes.
 */
export type MutateEntitiesReturnType = {
  txHash: Hash
  createdEntities: Hex[]
  updatedEntities: Hex[]
  deletedEntities: Hex[]
  extendedEntities: Hex[]
  ownershipChanges: Hex[]
}

export async function mutateEntities(
  client: ArkivClient,
  data: MutateEntitiesParameters,
  txParams?: TxParams,
): Promise<MutateEntitiesReturnType> {
  if (!data.creates && !data.updates && !data.deletes && !data.extensions) {
    throw new Error("No operations to perform")
  }

  const { receipt, createdEntityKeys } = await sendArkivTransaction(client, data, txParams)

  logger("Receipt from mutateEntities %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    createdEntities: createdEntityKeys,
    updatedEntities: (data.updates ?? []).map((u) => u.entityKey),
    deletedEntities: (data.deletes ?? []).map((d) => d.entityKey),
    extendedEntities: (data.extensions ?? []).map((e) => e.entityKey),
    ownershipChanges: (data.ownershipChanges ?? []).map((o) => o.entityKey),
  }
}
