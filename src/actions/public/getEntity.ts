import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { entityFromRpcResult } from "../../utils/entities"

export async function getEntity(client: ArkivClient, key: Hex) {
	const payload = await client.request({
		method: "golembase_getStorageValue",
		params: [key],
	})
	console.debug("Payload", payload)

	return entityFromRpcResult(client, key, payload)
}
