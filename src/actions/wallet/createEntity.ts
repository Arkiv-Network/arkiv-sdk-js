import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { Annotation, TxParams } from "../../types"
import { opsToTxData, sendArkivTransaction } from "../../utils/arkivTransactions"

export type CreateEntityParameters = {
	payload: Uint8Array
	annotations: Annotation[]
	btl: number
}

export type CreateEntityReturnType = {
	entityKey: Hex
	txHash: string
}

export async function createEntity(
	client: ArkivClient,
	data: CreateEntityParameters,
	txParams?: TxParams,
): Promise<CreateEntityReturnType> {
	console.debug("createEntity", data)
	const txData = opsToTxData({ creates: [data] })
	const receipt = await sendArkivTransaction(client, txData, txParams)

	return {
		txHash: receipt.transactionHash,
		entityKey: receipt.logs[0].topics[1] as Hex,
	}
}
