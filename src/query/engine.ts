import { numberToHex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import type { Entity } from "../types/entity"
import type { RpcQueryOptions, RpcSelect } from "../types/rpcSchema"
import { entityFromRpcResult } from "../utils/entities"
import { getLogger } from "../utils/logger"
import { asQueryError } from "./errors"

const logger = getLogger("query:engine")

export const MAX_LIMIT = 100

/** One `arkiv_query` call. */
export type QueryRequest = {
  /** The query expression, already rendered. */
  query: string
  /** What to return. */
  select: RpcSelect
  /** Page size, up to {@link MAX_LIMIT}. Defaults to the node's own page size. */
  limit?: number | undefined
  /** How many matches to skip before the page. Defaults to none. */
  offset?: number | undefined
  /** Whether to also count every entity the query matches. */
  count?: boolean | undefined
}

/** One page of results. */
export type QueryResponse = {
  entities: Entity[]
  /** The block the page was read at. */
  blockNumber: bigint
  /** How many entities the query matches, if the request asked to count them. */
  count: bigint | undefined
}

/**
 * Runs one query and decodes the page it returns.
 *
 * @throws If `limit` is not an integer from 1 to {@link MAX_LIMIT}, or `offset` is not a
 * non-negative integer.
 * @throws {QueryError} If the node rejects the query.
 */
export async function runQuery(client: ArkivClient, request: QueryRequest): Promise<QueryResponse> {
  const { query, select, limit, offset, count } = request

  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`limit must be a positive integer, got ${limit}.`)
    }
    if (limit > MAX_LIMIT) {
      throw new Error(
        `limit ${limit} exceeds the node maximum of ${MAX_LIMIT}. Page through the results with ` +
          "an offset instead.",
      )
    }
  }
  // Safe, not just whole: an offset has no maximum that would catch one too large to send exactly.
  if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) {
    throw new Error(`offset must be a non-negative integer, got ${offset}.`)
  }

  const queryOptions: RpcQueryOptions = {
    select: count ? { ...select, count: true } : select,
    ...(limit !== undefined && { limit: numberToHex(limit) }),
    ...(offset !== undefined && { offset: numberToHex(offset) }),
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
    count: result.count === undefined ? undefined : BigInt(result.count),
  }
}
