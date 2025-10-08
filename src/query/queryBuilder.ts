import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import { entityFromRpcResult } from "../utils/entities"
import { processQuery } from "./engine"
import type { Predicate } from "./predicate"
import { QueryResult } from "./queryResult"

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

	ownedBy(ownedBy: Hex) {
		this._ownedBy = ownedBy
		return this
	}

	withAnnotations(withAnnotations: boolean = true) {
		this._withAnnotations = withAnnotations
		return this
	}

	withMetadata(withMetadata: boolean = true) {
		this._withMetadata = withMetadata
		return this
	}

	limit(limit: number) {
		this._limit = limit
		return this
	}

	offset(offset: number) {
		this._offset = offset
		return this
	}

	where(predicates: Predicate[] | Predicate) {
		if (Array.isArray(predicates)) {
			this._predicates.push(...predicates)
		} else {
			this._predicates.push(predicates)
		}
		return this
	}

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
