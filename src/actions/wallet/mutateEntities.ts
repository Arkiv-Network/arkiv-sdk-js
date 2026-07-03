import type { Hash, Hex, TransactionReceipt } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"
import type { ChangeOwnershipParameters } from "./changeOwnership"

const logger = getLogger("actions:wallet:mutate-entities")

import type { CreateEntityParameters } from "./createEntity"
import type { DeleteEntityParameters } from "./deleteEntity"
import type { ExtendEntityParameters } from "./extendEntity"
import { type PatchEntityParameters, resolvePatches } from "./patchEntity"
import type { UpdateEntityParameters } from "./updateEntity"

/**
 * Parameters for the mutateEntities function.
 * - creates: The creates to perform.
 * - updates: The updates to perform. Each update is a **full replace**, not a
 *   patch: the entity's new state is exactly the update's parameters (see
 *   updateEntity).
 * - patches: The patches to perform. Each patch is resolved into a full update
 *   by fetching the entity's current state first (see patchEntity). Several
 *   patches for the same entity key are applied in order and folded into a
 *   single update, each one seeing the previous one's changes. **Patches are
 *   not atomic**: changes made to an entity between that read and the
 *   mutation transaction landing on chain are silently overwritten and lost.
 *   Patched entity keys are reported in updatedEntities (once per entity).
 * - deletes: The deletes to perform.
 * - extensions: The extensions to perform.
 */
export type MutateEntitiesParameters = {
  creates?: CreateEntityParameters[]
  updates?: UpdateEntityParameters[]
  patches?: PatchEntityParameters[]
  deletes?: DeleteEntityParameters[]
  extensions?: ExtendEntityParameters[]
  ownershipChanges?: ChangeOwnershipParameters[]
}

function parseReceipt(receipt: TransactionReceipt, params: MutateEntitiesParameters) {
  const createdEntities: Hex[] = []
  const updatedEntities: Hex[] = []
  const deletedEntities: Hex[] = []
  const extendedEntities: Hex[] = []
  const ownershipChanges: Hex[] = []

  const totalCreates = params.creates?.length ?? 0
  const totalUpdates = params.updates?.length ?? 0
  const totalDeletes = params.deletes?.length ?? 0
  const totalExtensions = params.extensions?.length ?? 0

  // iterate over all logs and parse the event
  // logs go in the following order: creates, deleted, updates, extends, ownership changes
  for (let index = 0; index < receipt.logs.length; index++) {
    const log = receipt.logs[index]

    if (index < totalCreates) {
      createdEntities.push(log.topics[1] as Hex)
    } else if (index < totalCreates + totalDeletes) {
      deletedEntities.push(log.topics[1] as Hex)
    } else if (index < totalCreates + totalUpdates + totalDeletes) {
      updatedEntities.push(log.topics[1] as Hex)
    } else if (index < totalCreates + totalUpdates + totalDeletes + totalExtensions) {
      extendedEntities.push(log.topics[1] as Hex)
    } else {
      ownershipChanges.push(log.topics[1] as Hex)
    }
  }

  return { createdEntities, updatedEntities, deletedEntities, extendedEntities, ownershipChanges }
}

/**
 * Return type for the mutateEntities function.
 * - txHash: The transaction hash.
 * - createdEntities: The keys of the created entities.
 * - updatedEntities: The keys of the updated entities (including patched ones).
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
  const operationCount =
    (data.creates?.length ?? 0) +
    (data.updates?.length ?? 0) +
    (data.patches?.length ?? 0) +
    (data.deletes?.length ?? 0) +
    (data.extensions?.length ?? 0) +
    (data.ownershipChanges?.length ?? 0)
  if (operationCount === 0) {
    throw new Error("No operations to perform")
  }

  const resolvedPatches = await resolvePatches(client, data.patches ?? [])
  const updates = [...(data.updates ?? []), ...resolvedPatches]

  const txData = opsToTxData({
    creates: data.creates ?? [],
    updates,
    deletes: data.deletes ?? [],
    extensions: data.extensions ?? [],
    ownershipChanges: data.ownershipChanges ?? [],
  })

  const receipt = await sendArkivTransaction(client, txData, txParams)

  logger("Receipt from mutateEntities %o", receipt)

  const { createdEntities, updatedEntities, deletedEntities, extendedEntities, ownershipChanges } =
    parseReceipt(receipt, { ...data, updates })
  return {
    txHash: receipt.transactionHash as Hash,
    createdEntities,
    updatedEntities,
    deletedEntities,
    extendedEntities,
    ownershipChanges,
  }
}
