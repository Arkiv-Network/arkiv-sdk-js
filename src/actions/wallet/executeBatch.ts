import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Schema } from "../../schema"
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
 *
 * Each create and patch names its own schema, and is typed by it — a batch can write entities of
 * several schemas at once.
 *
 * @typeParam TCreates - The schema of each create, in order. Inferred.
 * @typeParam TPatches - The schema of each patch, in order. Inferred.
 */
export type ExecuteBatchParameters<
  TCreates extends readonly Schema[] = readonly Schema[],
  TPatches extends readonly Schema[] = readonly Schema[],
> = {
  /** The entities to create. */
  creates?: { readonly [I in keyof TCreates]: CreateEntityParameters<TCreates[I]> } | undefined
  /** The patches to apply. */
  patches?: { readonly [I in keyof TPatches]: PatchEntityParameters<TPatches[I]> } | undefined
  /** The entities to delete. */
  deletes?: readonly DeleteEntityParameters[] | undefined
  /** The expiries to set. */
  extensions?: readonly ExtendEntityParameters[] | undefined
  /** The ownership transfers to perform. */
  ownershipChanges?: readonly ChangeOwnershipParameters[] | undefined
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

export async function executeBatch<
  const TCreates extends readonly Schema[] = [],
  const TPatches extends readonly Schema[] = [],
>(
  client: ArkivClient,
  data: ExecuteBatchParameters<TCreates, TPatches>,
  txParams?: TxParams,
): Promise<ExecuteBatchReturnType> {
  const { receipt, createdEntityKeys } = await sendArkivTransaction(
    client,
    data as ExecuteBatchParameters,
    txParams,
  )

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
