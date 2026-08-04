import { numberToHex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import type { Entity } from "../types/entity"
import type { RpcQueryOptions, RpcSelect } from "../types/rpcSchema"
import { entityFromRpcResult } from "../utils/entities"
import { getLogger } from "../utils/logger"
import { asQueryError } from "./errors"

const logger = getLogger("query:engine")

export const MAX_LIMIT = 200

/** One `arkiv_query` call. */
export type QueryRequest = {
  /** The query expression, already rendered. */
  query: string
  /** What to return. */
  select: RpcSelect
  /** Page size, up to {@link MAX_LIMIT}. Defaults to the node's own page size. */
  limit?: number | undefined
  /** Cursor from a previous page. */
  cursor?: string | undefined
  /** Block height to read at. Defaults to the head. */
  atBlock?: bigint | undefined
}

/** One page of results. */
export type QueryResponse = {
  entities: Entity[]
  /** The block the page was read at — the same for every page of a paginated query. */
  blockNumber: bigint
  /** The cursor for the next page, or `undefined` when this was the last one. */
  cursor: string | undefined
}

/**
 * Runs one query and decodes the page it returns.
 *
 * @throws {QueryError} If the node rejects the query.
 */
export async function runQuery(client: ArkivClient, request: QueryRequest): Promise<QueryResponse> {
  const { query, select, limit, cursor, atBlock } = request

  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`limit must be a positive integer, got ${limit}.`)
    }
    if (limit > MAX_LIMIT) {
      throw new Error(
        `limit ${limit} exceeds the node maximum of ${MAX_LIMIT}. Page through the results with ` +
          "the cursor instead.",
      )
    }
  }

  const queryOptions: RpcQueryOptions = {
    select,
    ...(atBlock !== undefined && { atBlock: numberToHex(atBlock) }),
    ...(limit !== undefined && { limit: numberToHex(limit) }),
    ...(cursor !== undefined && { cursor }),
  }

  logger("arkiv_query %s %o", query, queryOptions)

  const result = await client
    .request({ method: "arkiv_query", params: [query, queryOptions] })
    .catch((error: unknown) => {
      throw asQueryError(error, query) ?? error
    })

  logger("Raw result from query %o", result)

  return {
    entities: result.data.map((rpcEntity) => entityFromRpcResult(rpcEntity)),
    blockNumber: BigInt(result.blockNumber),
    cursor: result.cursor,
  }
}
