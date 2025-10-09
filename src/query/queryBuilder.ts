import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import { entityFromRpcResult } from "../utils/entities"
import { processQuery } from "./engine"
import type { Predicate } from "./predicate"
import { QueryResult } from "./queryResult"

/**
 * QueryBuilder is a helper class to build queries to the Arkiv DBChains.
 * It can be used to fetch entities from the Arkiv DBChains. It follows the Builder pattern allowing chaining of methods.
 * @param client - The Arkiv client
 * @returns The QueryBuilder instance {@link QueryBuilder}
 */
export class QueryBuilder {
	private _client: ArkivClient
	private _ownedBy: Hex | undefined
	private _validBeforeBlock: number | undefined
	private _withAnnotations: boolean | undefined
	private _withMetadata: boolean | undefined
	private _limit: number | undefined
	private _offset: number | undefined
	private _predicates: Predicate[]

	constructor(client: ArkivClient) {
		this._client = client
		this._predicates = []
	}

	/**
	 * Sets the ownedBy filter
	 * @param ownedBy - The address of the owner
	 * @returns The QueryBuilder instance
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * builder.ownedBy("0x1234567890123456789012345678901234567890")
	 */
	ownedBy(ownedBy: Hex) {
		this._ownedBy = ownedBy
		return this
	}

	/**
	 * Sets the withAnnotations flag which will return the annotations for the entities if true
	 * @param withAnnotations - The boolean value to set
	 * @returns The QueryBuilder instance
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * builder.withAnnotations(true)
	 */
	withAnnotations(withAnnotations: boolean = true) {
		this._withAnnotations = withAnnotations
		return this
	}

	/**
	 * Sets the withMetadata flag which will return the metadata (like owner, expiredAt, etc.) for the entities if true
	 * @param withMetadata - The boolean value to set
	 * @returns The QueryBuilder instance
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * builder.withMetadata(true)
	 */
	withMetadata(withMetadata: boolean = true) {
		this._withMetadata = withMetadata
		return this
	}

	/**
	 * Sets the limit for the query
	 * @param limit - The number of entities to return
	 * @returns The QueryBuilder instance
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * builder.limit(10)
	 */
	limit(limit: number) {
		this._limit = limit
		return this
	}

	/**
	 * Sets the offset for the query
	 * @param offset - The number of entities to skip
	 * @returns The QueryBuilder instance
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * builder.offset(10)
	 */
	offset(offset: number) {
		this._offset = offset
		return this
	}

	/**
	 * Sets the predicates for the query limiting the results. It can be a single predicate or an array of predicates combined with 'and'.
	 * Predicates can be nested using 'or' and 'and' predicates.
	 * @param predicates - The predicates to set
	 * @returns The QueryBuilder instance
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * builder.where(eq("name", "John"))
	 * builder.where([eq("name", "John"), eq("age", 30)])
	 * builder.where([eq("name", "John"), or([eq("age", 30), eq("age", 31)])])
	 * builder.where([eq("name", "John"), and([eq("age", 30), eq("age", 31)])])
	 * builder.where([eq("name", "John"), or([eq("age", 30), and([eq("age", 31), eq("age", 32)])])])
	 * builder.where([eq("name", "John"), and([eq("age", 30), or([eq("age", 31), eq("age", 32)])])])
	 * builder.where([eq("name", "John"), and([eq("age", 30), or([eq("age", 31), and([eq("age", 32), eq("age", 33)])])])])
	 */
	where(predicates: Predicate[] | Predicate) {
		if (Array.isArray(predicates)) {
			this._predicates.push(...predicates)
		} else {
			this._predicates.push(predicates)
		}
		return this
	}

	/**
	 * Fetches the entities from the query. Re
	 * It will return a QueryResult instance which can be used to fetch the next and previous pages.
	 * @returns The QueryResult instance {@link QueryResult}
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * const result = await builder.where(eq("name", "John")).fetch()
	 * // result = { entities: [Entity, Entity, Entity], next: async () => QueryResult, previous: async () => QueryResult }
	 */
	async fetch() {
		const queryResult = await processQuery(this._client, {
			predicates: this._predicates,
			limit: this._limit,
			offset: this._offset,
			ownedBy: this._ownedBy,
			validBeforeBlock: this._validBeforeBlock,
			withAnnotations: this._withAnnotations,
			withMetadata: this._withMetadata,
		})

		const entities = await Promise.all(
			queryResult.map((entity) => entityFromRpcResult(this._client, entity.key, entity.value)),
		)

		return new QueryResult(entities, this, this._limit, this._offset)
	}

	/**
	 * Counts the entities from the query.
	 * @returns The number of entities
	 *
	 * @example
	 * const builder = new QueryBuilder(client)
	 * const result = await builder.where(eq("name", "John")).count()
	 * // result = 10
	 */
	async count() {
		const queryResult = await processQuery(this._client, {
			predicates: this._predicates,
			limit: this._limit,
			offset: this._offset,
			ownedBy: this._ownedBy,
			validBeforeBlock: this._validBeforeBlock,
			withAnnotations: this._withAnnotations,
			withMetadata: this._withMetadata,
		})

		return queryResult.length
	}
}
