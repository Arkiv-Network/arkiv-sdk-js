import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test"
import type { ArkivClient } from "../clients/baseClient"
import { Entity } from "../types/entity"
import * as entitiesUtils from "../utils/entities"
import * as engine from "./engine"
import { and, eq, gt, gte, neq, or } from "./predicate"
import { QueryBuilder } from "./queryBuilder"

describe("QueryBuilder", () => {
	let mockClient: ArkivClient
	let mockProcessQuery: any
	let mockEntityFromRpcResult: any

	beforeEach(() => {
		// Create a mock client
		mockClient = {
			request: jest.fn(),
		} as unknown as ArkivClient

		// Spy on the functions instead of mocking the module
		mockProcessQuery = jest.spyOn(engine, "processQuery")
		mockEntityFromRpcResult = jest.spyOn(entitiesUtils, "entityFromRpcResult")
	})

	afterEach(() => {
		// Restore all spies to prevent test interference
		jest.restoreAllMocks()
	})

	test("creates QueryBuilder with empty predicates", () => {
		const builder = new QueryBuilder(mockClient)
		expect(builder).toBeDefined()
	})

	describe("where() method", () => {
		test("adds single predicate", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.where(eq("name", "test")).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [eq("name", "test")],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("adds multiple predicates as array", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const predicates = [eq("name", "test"), gt("age", 18)]
			await builder.where(predicates).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: predicates,
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("chains multiple where() calls", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder
				.where(eq("name", "test"))
				.where(gt("age", 18))
				.where([neq("status", "inactive"), eq("verified", 1)])
				.fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [
					eq("name", "test"),
					gt("age", 18),
					neq("status", "inactive"),
					eq("verified", 1),
				],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("handles complex predicates with or/and", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const complexPredicate = or([eq("type", "admin"), eq("type", "moderator")])
			await builder.where(complexPredicate).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [complexPredicate],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("handles nested or/and predicates", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const nestedPredicate = and([
				eq("active", 1),
				or([eq("role", "admin"), eq("role", "moderator")]),
			])
			await builder.where(nestedPredicate).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [nestedPredicate],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})
	})

	describe("builder methods chain correctly", () => {
		test("ownedBy() sets owner", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const owner = "0x1234567890123456789012345678901234567890" as const
			await builder.ownedBy(owner).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: undefined,
				offset: undefined,
				ownedBy: owner,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("limit() sets limit", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.limit(10).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: 10,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("offset() sets offset", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.offset(20).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: undefined,
				offset: 20,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})

		test("withAnnotations() sets withAnnotations to true by default", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.withAnnotations().fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: true,
				withMetadata: undefined,
			})
		})

		test("withAnnotations(false) sets withAnnotations to false", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.withAnnotations(false).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: false,
				withMetadata: undefined,
			})
		})

		test("withMetadata() sets withMetadata to true by default", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.withMetadata().fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: true,
			})
		})

		test("withMetadata(false) sets withMetadata to false", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.withMetadata(false).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: false,
			})
		})

		test("all methods chain together correctly", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const owner = "0x1234567890123456789012345678901234567890" as const
			await builder
				.where(eq("name", "test"))
				.where(gte("age", 18))
				.ownedBy(owner)
				.limit(10)
				.offset(20)
				.withAnnotations(true)
				.withMetadata(true)
				.fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [eq("name", "test"), gte("age", 18)],
				limit: 10,
				offset: 20,
				ownedBy: owner,
				validBeforeBlock: undefined,
				withAnnotations: true,
				withMetadata: true,
			})
		})
	})

	describe("fetch() method", () => {
		test("calls processQuery and entityFromRpcResult", async () => {
			const mockQueryResult = [
				{ key: "0xabc" as const, value: "encodedData1" },
				{ key: "0xdef" as const, value: "encodedData2" },
			]
			const mockEntity1 = new Entity("0xabc" as const, "0x123" as const, 1000, new Uint8Array(), [])
			const mockEntity2 = new Entity("0xdef" as const, "0x456" as const, 2000, new Uint8Array(), [])

			mockProcessQuery.mockResolvedValue(mockQueryResult)
			mockEntityFromRpcResult.mockResolvedValueOnce(mockEntity1).mockResolvedValueOnce(mockEntity2)

			const builder = new QueryBuilder(mockClient)
			const result = await builder.where(eq("name", "test")).fetch()

			expect(mockProcessQuery).toHaveBeenCalled()
			expect(mockEntityFromRpcResult).toHaveBeenCalled()
			expect(mockEntityFromRpcResult).toHaveBeenCalledWith(mockClient, "0xabc", "encodedData1")
			expect(mockEntityFromRpcResult).toHaveBeenCalledWith(mockClient, "0xdef", "encodedData2")
			expect(result.entities).toHaveLength(2)
			expect(result.entities[0]).toBe(mockEntity1)
			expect(result.entities[1]).toBe(mockEntity2)
		})

		test("returns QueryResult with correct properties", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const result = await builder.limit(10).offset(5).fetch()

			expect(result).toBeDefined()
			expect(result.entities).toEqual([])
		})
	})

	describe("count() method", () => {
		test("calls processQuery and returns count", async () => {
			const mockQueryResult = [
				{ key: "0xabc", value: "data1" },
				{ key: "0xdef", value: "data2" },
				{ key: "0xghi", value: "data3" },
			]
			mockProcessQuery.mockResolvedValue(mockQueryResult)

			const builder = new QueryBuilder(mockClient)
			const count = await builder.where(eq("status", "active")).count()

			expect(mockProcessQuery).toHaveBeenCalled()
			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [eq("status", "active")],
				limit: undefined,
				offset: undefined,
				ownedBy: undefined,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
			expect(count as number).toEqual(3 as number)
			// Verify entityFromRpcResult is NOT called for count()
			expect(mockEntityFromRpcResult).not.toHaveBeenCalled()
		})

		test("returns 0 for empty results", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const count = await builder.count()

			expect(count as number).toEqual(0 as number)
		})

		test("count() uses all builder parameters", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const owner = "0x1234567890123456789012345678901234567890" as const
			await builder
				.where([eq("active", 1), gte("score", 100)])
				.ownedBy(owner)
				.limit(50)
				.offset(10)
				.count()

			expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
				predicates: [eq("active", 1), gte("score", 100)],
				limit: 50,
				offset: 10,
				ownedBy: owner,
				validBeforeBlock: undefined,
				withAnnotations: undefined,
				withMetadata: undefined,
			})
		})
	})

	describe("predicate types", () => {
		test("passes string values correctly", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.where(eq("name", "john")).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(
				mockClient,
				expect.objectContaining({
					predicates: [eq("name", "john")],
				}),
			)
		})

		test("passes numeric values correctly", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			await builder.where(gt("age", 25)).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(
				mockClient,
				expect.objectContaining({
					predicates: [gt("age", 25)],
				}),
			)
		})

		test("passes mixed predicates correctly", async () => {
			mockProcessQuery.mockResolvedValue([])

			const builder = new QueryBuilder(mockClient)
			const predicates = [eq("name", "john"), gt("age", 25), neq("status", "inactive")]
			await builder.where(predicates).fetch()

			expect(mockProcessQuery).toHaveBeenCalledWith(
				mockClient,
				expect.objectContaining({
					predicates: predicates,
				}),
			)
		})
	})
})
