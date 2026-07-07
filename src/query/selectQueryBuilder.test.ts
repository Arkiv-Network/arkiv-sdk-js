import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test"
import type { ArkivClient } from "../clients/baseClient"
import type { Entity } from "../types/entity"
import * as entitiesUtils from "../utils/entities"
import * as engine from "./engine"
import { eq, gte } from "./predicate"
import { SelectQueryBuilder } from "./queryBuilder"
import { selectionToIncludeData } from "./selection"

describe("SelectQueryBuilder", () => {
  let mockClient: ArkivClient
  let mockProcessQuery: any

  beforeEach(() => {
    mockClient = {
      request: jest.fn(),
    } as unknown as ArkivClient

    mockProcessQuery = jest.spyOn(engine, "processQuery")
    jest.spyOn(entitiesUtils, "entityFromRpcResult")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("select() with no argument forwards include-data for everything", async () => {
    mockProcessQuery.mockResolvedValue({ data: [] })

    await new SelectQueryBuilder(mockClient).where(eq("name", "test")).fetch()

    expect(mockProcessQuery).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        predicates: [eq("name", "test")],
        includeData: selectionToIncludeData(),
      }),
    )
  })

  test('select("*") forwards include-data for everything', async () => {
    mockProcessQuery.mockResolvedValue({ data: [] })

    await new SelectQueryBuilder(mockClient, "*").fetch()

    expect(mockProcessQuery).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        includeData: selectionToIncludeData("*"),
      }),
    )
  })

  test("select({ owner: true, attributes: true }) forwards the resolved include-data", async () => {
    mockProcessQuery.mockResolvedValue({ data: [] })

    await new SelectQueryBuilder(mockClient, { owner: true, attributes: true }).fetch()

    expect(mockProcessQuery).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        includeData: selectionToIncludeData({ owner: true, attributes: true }),
      }),
    )
  })

  test("select({ owner: true }) forwards narrowed include-data", async () => {
    mockProcessQuery.mockResolvedValue({ data: [] })

    await new SelectQueryBuilder(mockClient, { owner: true }).fetch()

    const call = mockProcessQuery.mock.calls[0][1]
    expect(call.includeData).toEqual(selectionToIncludeData({ owner: true }))
    expect(call.includeData.owner).toBe(true)
    expect(call.includeData.creator).toBe(false)
    // key is opt-in: not selected here, so it is excluded
    expect(call.includeData.key).toBe(false)
  })

  test("does not forward the with* boolean flags", async () => {
    mockProcessQuery.mockResolvedValue({ data: [] })

    await new SelectQueryBuilder(mockClient, { attributes: true }).fetch()

    const call = mockProcessQuery.mock.calls[0][1]
    expect(call.withAttributes).toBeUndefined()
    expect(call.withMetadata).toBeUndefined()
    expect(call.withPayload).toBeUndefined()
  })

  test("shares the filtering/pagination chain methods", async () => {
    mockProcessQuery.mockResolvedValue({ data: [] })

    const owner = "0x1234567890123456789012345678901234567890" as const
    await new SelectQueryBuilder(mockClient, { attributes: true })
      .where(eq("name", "test"))
      .where(gte("age", 18))
      .ownedBy(owner)
      .createdBy(owner)
      .limit(10)
      .cursor("0xABC123")
      .validAtBlock(123n)
      .fetch()

    expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
      predicates: [eq("name", "test"), gte("age", 18)],
      limit: 10,
      cursor: "0xABC123",
      ownedBy: owner,
      createdBy: owner,
      validAtBlock: 123n,
      includeData: selectionToIncludeData({ attributes: true }),
    })
  })

  test("count() ignores the selection and requests no data", async () => {
    mockProcessQuery.mockResolvedValue({
      data: [
        { key: "0xabc", value: "data1" },
        { key: "0xdef", value: "data2" },
      ],
    })

    const count = await new SelectQueryBuilder(mockClient, "*")
      .where(eq("status", "active"))
      .count()

    expect(count).toBe(2)
    expect(mockProcessQuery).toHaveBeenCalledWith(mockClient, {
      predicates: [eq("status", "active")],
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      createdBy: undefined,
      validAtBlock: undefined,
      withAttributes: false,
      withMetadata: false,
      withPayload: false,
    })
  })

  describe("result entities", () => {
    test("fetch returns flat Entity instances with the selected data and methods", async () => {
      mockProcessQuery.mockResolvedValue({
        data: [
          {
            key: "0xabc",
            owner: "0xowner",
            value: "0x68656c6c6f", // "hello"
            stringAttributes: [{ key: "category", value: "docs" }],
            numericAttributes: [{ key: "score", value: "0x2a" }],
          },
        ],
        cursor: "",
        blockNumber: "0x1",
      })

      const result = await new SelectQueryBuilder(mockClient, {
        key: true,
        owner: true,
        attributes: true,
        payload: true,
      }).fetch()

      expect(result.entities).toHaveLength(1)
      const entity = result.entities[0] as unknown as Entity
      // flat, backwards-compatible field access
      expect(entity.key).toBe("0xabc")
      expect(entity.owner).toBe("0xowner")
      expect(entity.attributes).toEqual([
        { key: "category", value: "docs" },
        { key: "score", value: 42 },
      ])
      // entity methods are preserved on the result
      expect(typeof entity.toText).toBe("function")
      expect(entity.toText()).toBe("hello")
    })

    test("toJson decodes a JSON payload", async () => {
      mockProcessQuery.mockResolvedValue({
        data: [{ key: "0xabc", value: "0x7b2261223a317d" }], // {"a":1}
        cursor: "",
        blockNumber: "0x1",
      })

      const result = await new SelectQueryBuilder(mockClient, { payload: true }).fetch()
      const entity = result.entities[0] as unknown as Entity
      expect(entity.toJson()).toEqual({ a: 1 })
    })

    test("fields the RPC omits (because they were not selected) are undefined at runtime", async () => {
      // The RPC honours includeData and returns only the key.
      mockProcessQuery.mockResolvedValue({
        data: [{ key: "0xabc" }],
        cursor: "",
        blockNumber: "0x1",
      })

      const result = await new SelectQueryBuilder(mockClient, { key: true }).fetch()
      const entity = result.entities[0] as unknown as Entity
      expect(entity.key).toBe("0xabc")
      expect(entity.owner).toBeUndefined()
      expect(entity.payload).toBeUndefined()
      expect(entity.attributes).toEqual([])
    })
  })
})
