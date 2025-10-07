import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"
import type { CreateEntityParameters } from "./createEntity"
import type { DeleteEntityParameters } from "./deleteEntity"
import type { ExtendEntityParameters } from "./extendEntity"
import type { UpdateEntityParameters } from "./updateEntity"

export type MutateEntitiesParameters = {
	creates: CreateEntityParameters[]
	updates: UpdateEntityParameters[]
	deletes: DeleteEntityParameters[]
	extensions: ExtendEntityParameters[]
}

export type MutateEntitiesReturnType = {
	txHash: string
	createdEntities: Hex[]
	updatedEntities: Hex[]
	deletedEntities: Hex[]
	extendedEntities: Hex[]
}
export async function mutateEntities(
	client: ArkivClient,
	data: MutateEntitiesParameters,
	txParams?: TxParams,
): Promise<MutateEntitiesReturnType> {
	const txData = opsToTxData({
		creates: data.creates,
		updates: data.updates,
		deletes: data.deletes,
		extensions: data.extensions,
	})
	const receipt = await sendArkivTransaction(client, txData, txParams)

	console.debug("Receipt from mutateEntities", receipt)

	return {
		txHash: receipt.transactionHash,
		createdEntities: [],
		updatedEntities: [],
		deletedEntities: [],
		extendedEntities: [],
	}
}
