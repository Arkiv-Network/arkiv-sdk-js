import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import { Entity } from "../types/entity"

export async function entityFromRpcResult(client: ArkivClient, key: Hex, payload: string) {
	const metadata = await client.request({
		method: "golembase_getEntityMetaData",
		params: [key],
	})
	console.debug("Metadata", metadata)

	return new Entity(key, metadata.owner, metadata.expiresAtBlock, Uint8Array.fromBase64(payload), [
		...(metadata.stringAnnotations ?? []).map(({ key, value }) => ({
			key,
			value,
		})),
		...(metadata.numericAnnotations ?? []).map(({ key, value }) => ({
			key,
			value: value,
		})),
	])
}
