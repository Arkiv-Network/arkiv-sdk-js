import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Annotation, TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"

export type UpdateEntityParameters = {
	entityKey: Hex
	payload: Uint8Array | string
	annotations: Annotation[]
	btl: number
}

export type UpdateEntityReturnType = {
	entityKey: Hex
	txHash: string
}

export async function updateEntity(
	client: ArkivClient,
	data: UpdateEntityParameters,
	txParams?: TxParams,
): Promise<UpdateEntityReturnType> {
	console.debug("updateEntity", data)
	const txData = opsToTxData({ updates: [data] })
	const receipt = await sendArkivTransaction(client, txData, txParams)

	console.debug("Receipt from updateEntity", receipt)

	return {
		txHash: receipt.transactionHash,
		entityKey: receipt.logs[0].topics[1] as Hex,
	}
}
