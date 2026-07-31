import type { Hex } from "viem"
import { hexToNumber, numberToHex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import type { RpcIncludeData, RpcOrderByAttribute, RpcQueryOptions } from "../types/rpcSchema"
import { getLogger } from "../utils/logger"
import { isEntityKey } from "../utils/validation"
import type { Predicate } from "./predicate"

const logger = getLogger("query:engine")

function processPredicates(predicates: Predicate[]): string {
  const processValue = (value: string | number) => {
    if (typeof value === "string") {
      // 32-byte hex strings are stored as the EntityKey attribute type (see
      // encodeAttribute), which the query language only matches against unquoted
      // hex literals. All other strings — including shorter hex — are stored and
      // compared as quoted strings.
      return isEntityKey(value) ? value : `"${value}"`
    }
    return value
  }
  return predicates
    .map((predicate) => {
      switch (predicate.type) {
        case "eq":
          return `${predicate.key} = ${processValue(predicate.value)}`
        case "neq":
          return `${predicate.key} != ${processValue(predicate.value)}`
        case "gt":
          return `${predicate.key} > ${processValue(predicate.value)}`
        case "gte":
          return `${predicate.key} >= ${processValue(predicate.value)}`
        case "lt":
          return `${predicate.key} < ${processValue(predicate.value)}`
        case "lte":
          return `${predicate.key} <= ${processValue(predicate.value)}`
        case "not":
          return `!${predicate.key}`
        case "or":
          return `(${predicate.predicates.map((predicate) => processPredicates([predicate])).join(" || ")})`
        case "and":
          return `(${predicate.predicates.map((predicate) => processPredicates([predicate])).join(" && ")})`
        default:
          return ""
      }
    })
    .join(" && ")
}

export async function processQuery(
  client: ArkivClient,
  queryParams: {
    predicates: Predicate[]
    limit: number | undefined
    cursor: string | undefined
    ownedBy: Hex | undefined
    createdBy: Hex | undefined
    orderBy: RpcOrderByAttribute[] | undefined
    validAtBlock?: bigint | undefined
    withAttributes?: boolean | undefined
    withMetadata?: boolean | undefined
    withPayload?: boolean | undefined
    /**
     * Fully-resolved include-data for fine-grained selection. When provided it takes
     * precedence over the `withAttributes`/`withMetadata`/`withPayload` booleans.
     */
    includeData?: RpcIncludeData | undefined
  },
) {
  const {
    predicates,
    limit,
    cursor,
    ownedBy,
    createdBy,
    orderBy,
    validAtBlock,
    withAttributes,
    withMetadata,
    withPayload,
    includeData,
  } = queryParams

  logger("Processing query with params %o", {
    predicates,
    cursor,
    limit,
    ownedBy,
    createdBy,
    orderBy,
    validAtBlock,
    withAttributes,
    withMetadata,
    withPayload,
    includeData,
  })

  let query = processPredicates(predicates)
  if (ownedBy) {
    query += ` && $owner=${ownedBy}`
  }
  if (createdBy) {
    query += ` && $creator=${createdBy}`
  }

  // remove leading and trailing spaces and leading &&
  query = query.trim()
  if (query.startsWith("&& ")) {
    query = query.slice(3)
  }

  const queryOptions: RpcQueryOptions = {
    includeData:
      includeData ??
      ({
        key: true,
        attributes: withAttributes ?? false,
        payload: withPayload ?? false,
        contentType: withMetadata ?? false,
        expiration: withMetadata ?? false,
        owner: withMetadata ?? false,
        creator: withMetadata ?? false,
        createdAtBlock: withMetadata ?? false,
        lastModifiedAtBlock: withMetadata ?? false,
        transactionIndexInBlock: withMetadata ?? false,
        operationIndexInTransaction: withMetadata ?? false,
      } as RpcIncludeData),
  }

  if (validAtBlock !== undefined) {
    queryOptions.atBlock = numberToHex(validAtBlock)
  }
  if (limit !== undefined) {
    queryOptions.resultsPerPage = numberToHex(limit)
  }
  if (cursor !== undefined) {
    queryOptions.cursor = cursor
  }
  if (orderBy !== undefined) {
    queryOptions.orderBy = orderBy
  }

  logger("Built query to send %s %o", query, {
    includeData: queryOptions.includeData,
    atBlock: queryOptions.atBlock ? hexToNumber(queryOptions.atBlock) : undefined,
    orderBy: queryOptions.orderBy,
    resultsPerPage: queryOptions.resultsPerPage,
    cursor: queryOptions.cursor,
  })

  const result = await client.request({
    method: "arkiv_query",
    params: [query, queryOptions],
  })
  logger("Raw result from query %o", result)

  return result
}
