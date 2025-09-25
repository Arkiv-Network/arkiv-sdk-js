import type { ArkivClient } from "../../clients/baseClient";

export async function getEntityByKey(client: ArkivClient, key: string) {
	const entity = await client.request({
		method: "golembase_getStorageValue",
		params: [key],
	});

	return entity;
}
