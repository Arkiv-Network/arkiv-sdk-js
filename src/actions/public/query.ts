import type { ArkivClient } from "../../clients/baseClient"
import { entityFromRpcResult } from "../../utils/entities"

export async function query(client: ArkivClient, query: string) {
	const result = await client.request({
		method: "golembase_queryEntities",
		params: [query],
	})

	const entities = await Promise.all(
		result.map((entity) => entityFromRpcResult(client, entity.key, entity.value)),
	)

	return entities
}
