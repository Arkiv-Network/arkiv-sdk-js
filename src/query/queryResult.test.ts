import { beforeEach, describe, expect, jest, test } from "bun:test"
import { Entity } from "../types/entity"
import { NoMoreResultsError, NoOffsetOrLimitError, OffsetCannotBeLessThanZeroError } from "./errors"
import type { QueryBuilder } from "./queryBuilder"
import { QueryResult } from "./queryResult"

describe("QueryResult", () => {
	let mockQueryBuilder: QueryBuilder
	let mockEntities: Entity[]

	beforeEach(() => {
		// Create mock entities
		mockEntities = [
			new Entity("0x1" as const, "0xowner1" as const, 1000, new Uint8Array([1]), []),
			new Entity("0x2" as const, "0xowner2" as const, 2000, new Uint8Array([2]), []),
			new Entity("0x3" as const, "0xowner3" as const, 3000, new Uint8Array([3]), []),
		]

		// Create mock query builder
		mockQueryBuilder = {
			offset: jest.fn().mockReturnThis(),
			fetch: jest.fn(),
		} as unknown as QueryBuilder
	})

	describe("constructor", () => {
		test("creates QueryResult with entities and query builder", () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder)

			expect(result.entities).toEqual(mockEntities)
			expect(result.entities).toHaveLength(3)
		})

		test("creates QueryResult with limit and offset", () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, 0)

			expect(result.entities).toEqual(mockEntities)
		})

		test("creates QueryResult with undefined limit and offset", () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, undefined, undefined)

			expect(result.entities).toEqual(mockEntities)
		})

		test("creates QueryResult with empty entities array", () => {
			const result = new QueryResult([], mockQueryBuilder, 10, 0)

			expect(result.entities).toEqual([])
			expect(result.entities).toHaveLength(0)
		})
	})

	describe("next()", () => {
		test("throws NoOffsetOrLimitError when offset is undefined", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, undefined)

			await expect(result.next()).rejects.toThrow(NoOffsetOrLimitError)
			await expect(result.next()).rejects.toThrow(
				"Offset and limit must be defined to fetch next or previous",
			)
		})

		test("throws NoOffsetOrLimitError when limit is undefined", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, undefined, 0)

			await expect(result.next()).rejects.toThrow(NoOffsetOrLimitError)
			await expect(result.next()).rejects.toThrow(
				"Offset and limit must be defined to fetch next or previous",
			)
		})

		test("throws NoOffsetOrLimitError when both offset and limit are undefined", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder)

			await expect(result.next()).rejects.toThrow(NoOffsetOrLimitError)
		})

		test("throws NoMoreResultsError when limit < entities.length", async () => {
			// limit is 2 but we have 3 entities, so limit < entities.length triggers error
			const result = new QueryResult(mockEntities, mockQueryBuilder, 2, 0)

			await expect(result.next()).rejects.toThrow(NoMoreResultsError)
			await expect(result.next()).rejects.toThrow("No more results")
		})

		test("fetches next page when limit equals entities length", async () => {
			const newEntities = [
				new Entity("0x4" as const, "0xowner4" as const, 4000, new Uint8Array([4]), []),
				new Entity("0x5" as const, "0xowner5" as const, 5000, new Uint8Array([5]), []),
				new Entity("0x6" as const, "0xowner6" as const, 6000, new Uint8Array([6]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({
				entities: newEntities,
			})

			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			// limit is 3 and we have 3 entities, so there might be more
			const result = new QueryResult(mockEntities, mockQueryBuilder, 3, 0)

			await result.next()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(3)
			expect(mockFetch).toHaveBeenCalled()
			expect(result.entities).toEqual(newEntities)
		})

		test("updates offset correctly for multiple next calls", async () => {
			const initialEntities = [
				new Entity("0x1" as const, "0xowner1" as const, 1000, new Uint8Array([1]), []),
				new Entity("0x2" as const, "0xowner2" as const, 2000, new Uint8Array([2]), []),
				new Entity("0x3" as const, "0xowner3" as const, 3000, new Uint8Array([3]), []),
			]

			const newEntities1 = [
				new Entity("0x4" as const, "0xowner4" as const, 4000, new Uint8Array([4]), []),
				new Entity("0x5" as const, "0xowner5" as const, 5000, new Uint8Array([5]), []),
				new Entity("0x6" as const, "0xowner6" as const, 6000, new Uint8Array([6]), []),
			]

			const newEntities2 = [
				new Entity("0x7" as const, "0xowner7" as const, 7000, new Uint8Array([7]), []),
				new Entity("0x8" as const, "0xowner8" as const, 8000, new Uint8Array([8]), []),
				new Entity("0x9" as const, "0xowner9" as const, 9000, new Uint8Array([9]), []),
			]

			const mockOffset = jest.fn().mockReturnValue(mockQueryBuilder)
			const mockFetch = jest
				.fn()
				.mockResolvedValueOnce({ entities: newEntities1 })
				.mockResolvedValueOnce({ entities: newEntities2 })

			mockQueryBuilder.offset = mockOffset
			mockQueryBuilder.fetch = mockFetch

			// limit = 3, entities.length = 3, so 3 < 3 is false (won't throw)
			const result = new QueryResult(initialEntities, mockQueryBuilder, 3, 0)

			// First next call - offset should be 0 + 3 = 3
			await result.next()
			expect(mockOffset).toHaveBeenCalledWith(3)
			expect(result.entities).toEqual(newEntities1)

			// Second next call - offset should be 3 + 3 = 6
			await result.next()
			expect(mockOffset).toHaveBeenCalledWith(6)
			expect(result.entities).toEqual(newEntities2)
		})

		test("fetches next page when limit is greater than entities length", async () => {
			// limit is 5 but only 3 entities (5 > 3, so no error thrown)
			const newEntities = [
				new Entity("0x4" as const, "0xowner4" as const, 4000, new Uint8Array([4]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({
				entities: newEntities,
			})

			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			const result = new QueryResult(mockEntities, mockQueryBuilder, 5, 0)

			await result.next()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(5)
			expect(mockFetch).toHaveBeenCalled()
			expect(result.entities).toEqual(newEntities)
		})
	})

	describe("previous()", () => {
		test("throws NoOffsetOrLimitError when offset is undefined", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, undefined)

			await expect(result.previous()).rejects.toThrow(NoOffsetOrLimitError)
			await expect(result.previous()).rejects.toThrow(
				"Offset and limit must be defined to fetch next or previous",
			)
		})

		test("throws NoOffsetOrLimitError when limit is undefined", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, undefined, 10)

			await expect(result.previous()).rejects.toThrow(NoOffsetOrLimitError)
			await expect(result.previous()).rejects.toThrow(
				"Offset and limit must be defined to fetch next or previous",
			)
		})

		test("throws NoOffsetOrLimitError when both offset and limit are undefined", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder)

			await expect(result.previous()).rejects.toThrow(NoOffsetOrLimitError)
		})

		test("throws OffsetCannotBeLessThanZeroError when offset is 0", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, 0)

			await expect(result.previous()).rejects.toThrow(OffsetCannotBeLessThanZeroError)
			await expect(result.previous()).rejects.toThrow("Offset cannot be less than 0")
		})

		test("throws OffsetCannotBeLessThanZeroError when offset - limit < 0", async () => {
			// offset is 5, limit is 10, so 5 - 10 = -5 < 0
			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, 5)

			await expect(result.previous()).rejects.toThrow(OffsetCannotBeLessThanZeroError)
			await expect(result.previous()).rejects.toThrow("Offset cannot be less than 0")
		})

		test("fetches previous page successfully when offset >= limit", async () => {
			const previousEntities = [
				new Entity("0xa" as const, "0xownera" as const, 1000, new Uint8Array([10]), []),
				new Entity("0xb" as const, "0xownerb" as const, 2000, new Uint8Array([11]), []),
				new Entity("0xc" as const, "0xownerc" as const, 3000, new Uint8Array([12]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({
				entities: previousEntities,
			})

			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			// offset is 10, limit is 5, so 10 - 5 = 5 >= 0
			const result = new QueryResult(mockEntities, mockQueryBuilder, 5, 10)

			await result.previous()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(5)
			expect(mockFetch).toHaveBeenCalled()
			expect(result.entities).toEqual(previousEntities)
		})

		test("updates offset correctly for multiple previous calls", async () => {
			const previousEntities1 = [
				new Entity("0xd" as const, "0xownerd" as const, 4000, new Uint8Array([13]), []),
				new Entity("0xe" as const, "0xownere" as const, 5000, new Uint8Array([14]), []),
			]

			const previousEntities2 = [
				new Entity("0xf" as const, "0xownerf" as const, 6000, new Uint8Array([15]), []),
				new Entity("0x10" as const, "0xowner10" as const, 7000, new Uint8Array([16]), []),
			]

			const mockOffset = jest.fn().mockReturnValue(mockQueryBuilder)
			const mockFetch = jest
				.fn()
				.mockResolvedValueOnce({ entities: previousEntities1 })
				.mockResolvedValueOnce({ entities: previousEntities2 })

			mockQueryBuilder.offset = mockOffset
			mockQueryBuilder.fetch = mockFetch

			const result = new QueryResult(mockEntities, mockQueryBuilder, 3, 9)

			// First previous call - offset should be 9 - 3 = 6
			await result.previous()
			expect(mockOffset).toHaveBeenCalledWith(6)
			expect(result.entities).toEqual(previousEntities1)

			// Second previous call - offset should be 6 - 3 = 3
			await result.previous()
			expect(mockOffset).toHaveBeenCalledWith(3)
			expect(result.entities).toEqual(previousEntities2)
		})

		test("allows previous when offset exactly equals limit", async () => {
			const previousEntities = [
				new Entity("0x11" as const, "0xowner11" as const, 1000, new Uint8Array([17]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({
				entities: previousEntities,
			})

			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			// offset is 5, limit is 5, so 5 - 5 = 0 (valid)
			const result = new QueryResult(mockEntities, mockQueryBuilder, 5, 5)

			await result.previous()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0)
			expect(mockFetch).toHaveBeenCalled()
			expect(result.entities).toEqual(previousEntities)
		})
	})

	describe("pagination flow", () => {
		test("simulates complete pagination: next -> next -> previous -> previous", async () => {
			const page1 = [new Entity("0x1" as const, "0xowner1" as const, 1000, new Uint8Array([1]), [])]
			const page2 = [new Entity("0x2" as const, "0xowner2" as const, 2000, new Uint8Array([2]), [])]
			const page3 = [new Entity("0x3" as const, "0xowner3" as const, 3000, new Uint8Array([3]), [])]

			const mockOffset = jest.fn().mockReturnValue(mockQueryBuilder)
			const mockFetch = jest
				.fn()
				.mockResolvedValueOnce({ entities: page2 }) // first next
				.mockResolvedValueOnce({ entities: page3 }) // second next
				.mockResolvedValueOnce({ entities: page2 }) // first previous
				.mockResolvedValueOnce({ entities: page1 }) // second previous

			mockQueryBuilder.offset = mockOffset
			mockQueryBuilder.fetch = mockFetch

			const result = new QueryResult(page1, mockQueryBuilder, 1, 0)

			// Start at page 1 (offset 0)
			expect(result.entities).toEqual(page1)

			// Next to page 2 (offset 1)
			await result.next()
			expect(mockOffset).toHaveBeenCalledWith(1)
			expect(result.entities).toEqual(page2)

			// Next to page 3 (offset 2)
			await result.next()
			expect(mockOffset).toHaveBeenCalledWith(2)
			expect(result.entities).toEqual(page3)

			// Previous to page 2 (offset 1)
			await result.previous()
			expect(mockOffset).toHaveBeenCalledWith(1)
			expect(result.entities).toEqual(page2)

			// Previous to page 1 (offset 0)
			await result.previous()
			expect(mockOffset).toHaveBeenCalledWith(0)
			expect(result.entities).toEqual(page1)
		})

		test("prevents going before first page", async () => {
			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, 0)

			await expect(result.previous()).rejects.toThrow(OffsetCannotBeLessThanZeroError)
		})

		test("prevents going beyond when limit < entities.length", async () => {
			// limit is 2 but 3 entities, so 2 < 3 triggers NoMoreResultsError
			const result = new QueryResult(mockEntities, mockQueryBuilder, 2, 0)

			await expect(result.next()).rejects.toThrow(NoMoreResultsError)
		})
	})

	describe("edge cases", () => {
		test("handles empty entities array with pagination", async () => {
			const nextEntities = [
				new Entity("0x1" as const, "0xowner1" as const, 1000, new Uint8Array([1]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({ entities: nextEntities })
			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			const result = new QueryResult([], mockQueryBuilder, 10, 0)

			// limit (10) > entities.length (0), so it will try to fetch next page
			await result.next()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(10)
			expect(result.entities).toEqual(nextEntities)
		})

		test("handles limit of 1", async () => {
			const singleEntity = [
				new Entity("0x1" as const, "0xowner1" as const, 1000, new Uint8Array([1]), []),
			]
			const nextEntity = [
				new Entity("0x2" as const, "0xowner2" as const, 2000, new Uint8Array([2]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({ entities: nextEntity })
			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			const result = new QueryResult(singleEntity, mockQueryBuilder, 1, 0)

			await result.next()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(1)
			expect(result.entities).toEqual(nextEntity)
		})

		test("handles large offset values", async () => {
			const previousEntities = [
				new Entity("0x1" as const, "0xowner1" as const, 1000, new Uint8Array([1]), []),
			]

			const mockFetch = jest.fn().mockResolvedValue({ entities: previousEntities })
			mockQueryBuilder.fetch = mockFetch
			mockQueryBuilder.offset = jest.fn().mockReturnValue(mockQueryBuilder)

			const result = new QueryResult(mockEntities, mockQueryBuilder, 10, 1000)

			await result.previous()

			expect(mockQueryBuilder.offset).toHaveBeenCalledWith(990)
		})
	})
})
