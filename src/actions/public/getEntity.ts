import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { Entity } from "../../types/entity"

export async function getEntity(client: ArkivClient, key: Hex) {
	const payload = await client.request({
		method: "golembase_getStorageValue",
		params: [key],
	})
	console.debug("Payload", payload)

	const metadata = await client.request({
		method: "golembase_getEntityMetaData",
		params: [key],
	})
	console.debug("Metadata", metadata)

	return new Entity(
		key,
		metadata.owner as Hex,
		metadata.expiresAtBlock,
		Uint8Array.fromBase64(payload),
		[
			...metadata.numericAnnotations.map(({ key, value }) => ({
				key,
				value: value,
			})),
			...metadata.stringAnnotations.map(({ key, value }) => ({
				key,
				value,
			})),
		],
	)
}
