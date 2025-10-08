import type { ArkivClient } from "../../clients/baseClient"
import { QueryBuilder } from "../../query/queryBuilder"

export async function query(client: ArkivClient) {
	return new QueryBuilder(client)
}
