import type { ArkivClient } from "../../clients/baseClient"
import { QueryBuilder } from "../../query/queryBuilder"

/**
 * @deprecated Use `client.select()` (see SelectQueryBuilder) instead. `buildQuery()` returns
 * only the entity `key` unless data is explicitly opted in to, which is an easy mistake.
 */
export async function buildQuery(client: ArkivClient) {
  return new QueryBuilder(client)
}
