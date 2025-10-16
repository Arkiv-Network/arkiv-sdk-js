import { type Hex, toHex, toRlp } from "viem"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import type { DeleteEntityParameters } from "../actions/wallet/deleteEntity"
import type { ExtendEntityParameters } from "../actions/wallet/extendEntity"
import type { UpdateEntityParameters } from "../actions/wallet/updateEntity"
import type { ArkivClient } from "../clients/baseClient"
import type { WalletArkivClient } from "../clients/createWalletClient"
import { ARKIV_ADDRESS } from "../consts"
import type { TxParams } from "../types"

export function opsToTxData({
	creates,
	updates,
	deletes,
	extensions,
}: {
	creates?: CreateEntityParameters[]
	updates?: UpdateEntityParameters[]
	deletes?: DeleteEntityParameters[]
	extensions?: ExtendEntityParameters[]
}) {
	function formatAnnotation<T extends string | number | bigint | boolean>(annotation: {
		key: string
		value: T
	}): [Hex, Hex] {
		return [toHex(annotation.key), toHex(annotation.value)]
	}

	const payload = [
		//creates
		(creates ?? []).map((item) => [
			toHex(item.expiresIn),
			toHex(item.payload),
			item.annotations
				.filter((annotation) => typeof annotation.value === "string")
				.map(formatAnnotation),
			item.annotations
				.filter((annotation) => typeof annotation.value === "number")
				.map(formatAnnotation),
		]),
		//updates
		(updates ?? []).map((item) => [
			item.entityKey,
			toHex(item.expiresIn),
			toHex(item.payload),
			item.annotations
				.filter((annotation) => typeof annotation.value === "string")
				.map(formatAnnotation),
			item.annotations
				.filter((annotation) => typeof annotation.value === "number")
				.map(formatAnnotation),
		]),
		//deletes
		(deletes ?? []).map((item) => item.entityKey),
		//extends
		(extensions ?? []).map((item) => [item.entityKey, toHex(item.expiresIn)]),
	]

	console.debug("txData to send as RLP", payload)

	return toRlp(payload)
}

export async function sendArkivTransaction(client: ArkivClient, data: Hex, txParams?: TxParams) {
	if (!client.account) throw new Error("Account required")
	const walletClient = client as WalletArkivClient

	console.debug("Sending transaction", {
		account: client.account,
		chain: client.chain,
		to: ARKIV_ADDRESS,
		value: 0n,
		data,
		...txParams,
	})

	const txHash = await walletClient.sendTransaction({
		account: client.account,
		chain: client.chain,
		to: ARKIV_ADDRESS,
		value: 0n,
		data,
		...txParams,
	})

	const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash })

	console.debug("Tx receipt", receipt)

	return receipt
}
