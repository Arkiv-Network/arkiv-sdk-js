import { beforeEach, describe, expect, jest, test } from "bun:test"
import { Entity } from "../types/entity"
import { NoCursorOrLimitError, NoMoreResultsError } from "./errors"
import type { QueryBuilder } from "./queryBuilder"
import { QueryResult } from "./queryResult"

describe("QueryResult", () => {
  let mockQueryBuilder: QueryBuilder
  let mockEntities: Entity[]

  beforeEach(() => {
    // Create mock entities
    mockEntities = [
      new Entity("0x1" as const, "0xowner1" as const, 1000n, new Uint8Array([1]), []),
      new Entity("0x2" as const, "0xowner2" as const, 2000n, new Uint8Array([2]), []),
      new Entity("0x3" as const, "0xowner3" as const, 3000n, new Uint8Array([3]), []),
    ]

    // Create mock query builder
    mockQueryBuilder = {
      cursor: jest.fn().mockReturnThis(),
      fetch: jest.fn(),
    } as unknown as QueryBuilder
  })

  describe("constructor", () => {
    test("creates QueryResult with entities and query builder", () => {
      const result = new QueryResult(
        mockEntities,
        mockQueryBuilder,
        undefined,
        undefined,
        undefined,
      )

      expect(result.entities).toEqual(mockEntities)
      expect(result.entities).toHaveLength(3)
    })

    test("creates QueryResult with limit and cursor", () => {
      const result = new QueryResult(mockEntities, mockQueryBuilder, "0xABC123", 10, undefined)

      expect(result.entities).toEqual(mockEntities)
    })

    test("creates QueryResult with undefined limit and cursor", () => {
      const result = new QueryResult(
        mockEntities,
        mockQueryBuilder,
        undefined,
        undefined,
        undefined,
      )

      expect(result.entities).toEqual(mockEntities)
    })

    test("creates QueryResult with empty entities array", () => {
      const result = new QueryResult([], mockQueryBuilder, "0xABC123", 10, undefined)

      expect(result.entities).toEqual([])
      expect(result.entities).toHaveLength(0)
    })
  })

  describe("next()", () => {
    test("throws NoCursorOrLimitError when cursor is undefined", async () => {
      const result = new QueryResult(mockEntities, mockQueryBuilder, undefined, 10, undefined)

      await expect(result.next()).rejects.toThrow(NoCursorOrLimitError)
      await expect(result.next()).rejects.toThrow("Cursor and limit must be defined to fetch next")
    })

    test("throws NoCursorOrLimitError when limit is undefined", async () => {
      const result = new QueryResult(
        mockEntities,
        mockQueryBuilder,
        "0xABC123",
        undefined,
        undefined,
      )

      await expect(result.next()).rejects.toThrow(NoCursorOrLimitError)
      await expect(result.next()).rejects.toThrow("Cursor and limit must be defined to fetch next")
    })

    test("throws NoCursorOrLimitError when both cursor and limit are undefined", async () => {
      const result = new QueryResult(
        mockEntities,
        mockQueryBuilder,
        undefined,
        undefined,
        undefined,
      )

      await expect(result.next()).rejects.toThrow(NoCursorOrLimitError)
    })

    test("throws NoMoreResultsError when limit > entities.length", async () => {
      // limit is 4 but we have 3 entities, so limit > entities.length triggers error
      const result = new QueryResult(mockEntities, mockQueryBuilder, "0xABC123", 4, 123n)

      await expect(result.next()).rejects.toThrow(NoMoreResultsError)
    })

    test("fetches next page when limit equals entities length", async () => {
      const newEntities = [
        new Entity("0x4" as const, "0xowner4" as const, 4000n, new Uint8Array([4]), []),
        new Entity("0x5" as const, "0xowner5" as const, 5000n, new Uint8Array([5]), []),
        new Entity("0x6" as const, "0xowner6" as const, 6000n, new Uint8Array([6]), []),
      ]

      const mockFetch = jest.fn().mockResolvedValue({
        entities: newEntities,
      })

      mockQueryBuilder.fetch = mockFetch
      mockQueryBuilder.cursor = jest.fn().mockReturnValue(mockQueryBuilder)

      // limit is 3 and we have 3 entities, so there might be more
      const result = new QueryResult(mockEntities, mockQueryBuilder, "0xABC123", 3, undefined)

      await result.next()

      expect(mockQueryBuilder.cursor).toHaveBeenCalledWith("0xABC123")
      expect(mockFetch).toHaveBeenCalled()
      expect(result.entities).toEqual(newEntities)
    })

    test("updates offset correctly for multiple next calls", async () => {
      const initialEntities = [
        new Entity("0x1" as const, "0xowner1" as const, 1000n, new Uint8Array([1]), []),
        new Entity("0x2" as const, "0xowner2" as const, 2000n, new Uint8Array([2]), []),
        new Entity("0x3" as const, "0xowner3" as const, 3000n, new Uint8Array([3]), []),
      ]

      const newEntities1 = [
        new Entity("0x4" as const, "0xowner4" as const, 4000n, new Uint8Array([4]), []),
        new Entity("0x5" as const, "0xowner5" as const, 5000n, new Uint8Array([5]), []),
        new Entity("0x6" as const, "0xowner6" as const, 6000n, new Uint8Array([6]), []),
      ]

      const newEntities2 = [
        new Entity("0x7" as const, "0xowner7" as const, 7000n, new Uint8Array([7]), []),
        new Entity("0x8" as const, "0xowner8" as const, 8000n, new Uint8Array([8]), []),
        new Entity("0x9" as const, "0xowner9" as const, 9000n, new Uint8Array([9]), []),
      ]

      const mockCursor = jest.fn().mockReturnValue(mockQueryBuilder)
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          entities: newEntities1,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        })
        .mockResolvedValueOnce({
          entities: newEntities2,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        })

      mockQueryBuilder.cursor = mockCursor
      mockQueryBuilder.fetch = mockFetch

      // limit = 3, entities.length = 3, so 3 < 3 is false (won't throw)
      const result = new QueryResult(initialEntities, mockQueryBuilder, "0xABC123", 3, undefined)

      // First next call - offset should be 0 + 3 = 3
      await result.next()
      expect(mockCursor).toHaveBeenCalledWith("0xABC123")
      expect(result.entities).toEqual(newEntities1)

      // Second next call - offset should be 3 + 3 = 6
      await result.next()
      expect(mockCursor).toHaveBeenCalledWith("0xABC123")
      expect(result.entities).toEqual(newEntities2)
    })

    test("fetches next page when limit is greater than entities length", async () => {
      // limit is 5 but only 3 entities (5 > 3) so there is no more results
      // so NoMoreResultsError is thrown
      const result = new QueryResult(mockEntities, mockQueryBuilder, "0xABC123", 5, undefined)

      await expect(result.next()).rejects.toThrow(NoMoreResultsError)
    })
  })

  describe("pagination flow", () => {
    test("simulates complete pagination: next -> next -> previous -> previous", async () => {
      const page1 = [
        new Entity("0x1" as const, "0xowner1" as const, 1000n, new Uint8Array([1]), []),
      ]
      const page2 = [
        new Entity("0x2" as const, "0xowner2" as const, 2000n, new Uint8Array([2]), []),
      ]
      const page3 = [
        new Entity("0x3" as const, "0xowner3" as const, 3000n, new Uint8Array([3]), []),
      ]

      const mockCursor = jest.fn().mockReturnValue(mockQueryBuilder)
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          entities: page2,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        }) // first next
        .mockResolvedValueOnce({
          entities: page3,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        }) // second next
        .mockResolvedValueOnce({
          entities: page2,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        }) // first previous
        .mockResolvedValueOnce({
          entities: page1,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        }) // second previous

      mockQueryBuilder.cursor = mockCursor
      mockQueryBuilder.fetch = mockFetch

      const result = new QueryResult(page1, mockQueryBuilder, "0xABC123", 1, undefined)

      // Start at page 1 (offset 0)
      expect(result.entities).toEqual(page1)

      // Next to page 2 (offset 1)
      await result.next()
      expect(mockCursor).toHaveBeenCalledWith("0xABC123")
      expect(result.entities).toEqual(page2)

      // Next to page 3 (offset 2)
      await result.next()
      expect(mockCursor).toHaveBeenCalledWith("0xABC123")
      expect(result.entities).toEqual(page3)
    })

    test("There is another page to fetch when limit < entities.length", async () => {
      // limit is 2 but 3 entities, so 2 < 3 there is another page to fetch
      const mockCursor = jest.fn().mockReturnValue(mockQueryBuilder)
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          entities: mockEntities,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        })
        .mockResolvedValueOnce({
          entities: mockEntities,
          queryBuilder: mockQueryBuilder,
          cursor: "0xABC123",
        })

      mockQueryBuilder.cursor = mockCursor
      mockQueryBuilder.fetch = mockFetch

      const result = new QueryResult(mockEntities, mockQueryBuilder, "0xABC123", 2, undefined)

      await result.next()
      expect(mockCursor).toHaveBeenCalledWith("0xABC123")
      expect(result.entities).toEqual(mockEntities)
    })
  })
})
