import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import type { Predicate } from "./predicate"

function processPredicates(predicates: Predicate[]): string {
	const processValue = (value: string | number) => {
		if (typeof value === "string") {
			return `"${value}"`
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
		offset: number | undefined
		ownedBy: Hex | undefined
		validBeforeBlock?: number | undefined
		withAnnotations?: boolean | undefined
		withMetadata?: boolean | undefined
	},
) {
	const { predicates, limit, offset, ownedBy, validBeforeBlock, withAnnotations, withMetadata } =
		queryParams

	console.debug(
		`Processing query with params: predicates: ${predicates}, limit: ${limit}, offset: ${offset}, ownedBy: ${ownedBy}, validBeforeBlock: ${validBeforeBlock}, withAnnotations: ${withAnnotations}, withMetadata: ${withMetadata}`,
	)

	let query = processPredicates(predicates)
	if (ownedBy) {
		query += ` && $owner=${ownedBy}`
	}
	if (limit) {
		query += ` limit=${limit}`
	}

	if (offset) {
		query += ` offset=${offset}`
	}

	// remove leading and trailing spaces and leading &&
	query = query.trim()
	if (query.startsWith("&& ")) {
		query = query.slice(3)
	}

	console.debug(`Built query to send: ${query}`)

	const result = await client.request({
		method: "golembase_queryEntities",
		params: [query],
	})
	console.debug("Raw result from query: ", result)

	return result
}
