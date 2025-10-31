import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"

/**
 * Parameters for the deleteEntity function.
 * - entityKey: The key of the entity to delete.
 */
export type OwnershipChangeParameters = {
	entityKey: Hex
	newOwner: Hex
}

/**
 * Return type for the deleteEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type OwnershipChangeReturnType = {
	entityKey: Hex
	txHash: string
}

export async function ownershipChange(
	client: ArkivClient,
	data: OwnershipChangeParameters,
	txParams?: TxParams,
): Promise<OwnershipChangeReturnType> {
	console.debug("ownershipChange", data)
	const txData = opsToTxData({ ownershipChanges: [data] })
	const receipt = await sendArkivTransaction(client, txData, txParams)

	console.debug("Receipt from ownershipChange", receipt)

	return {
		txHash: receipt.transactionHash,
		entityKey: data.entityKey,
	}
}
