import type { Entity } from "../types/entity"
import { NoMoreResultsError, NoOffsetOrLimitError, OffsetCannotBeLessThanZeroError } from "./errors"
import type { QueryBuilder } from "./queryBuilder"

export class QueryResult {
	entities: Entity[]
	private limit: number | undefined
	private offset: number | undefined
	private queryBuilder: QueryBuilder

	constructor(
		entities: Entity[],
		queryBuilder: QueryBuilder,
		limit: number | undefined = undefined,
		offset: number | undefined = undefined,
	) {
		this.entities = entities
		this.limit = limit
		this.offset = offset
		this.queryBuilder = queryBuilder
	}

	async next() {
		if (this.offset === undefined || this.limit === undefined) {
			throw new NoOffsetOrLimitError()
		}
		if (this.limit < this.entities.length) {
			throw new NoMoreResultsError()
		}
		this.offset += this.limit
		const result = await this.queryBuilder.offset(this.offset).fetch()
		this.entities = result.entities
	}

	async previous() {
		if (this.offset === undefined || this.limit === undefined) {
			throw new NoOffsetOrLimitError()
		}
		if (this.offset - this.limit < 0) {
			throw new OffsetCannotBeLessThanZeroError()
		}
		this.offset -= this.limit
		const result = await this.queryBuilder.offset(this.offset).fetch()
		this.entities = result.entities
	}
}
