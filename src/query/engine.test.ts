import { describe, expect, it, jest } from "bun:test"
import type { ArkivClient } from "../clients/baseClient"
import { processQuery } from "./engine"
import type { Predicate } from "./predicate"

describe("processQuery tests", () => {
  const client = {
    request: jest.fn(),
  } as unknown as ArkivClient

  it("should process single predicate", async () => {
    const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
      withPayload: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value"`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process all simple predicates - flat", async () => {
    const predicates = [
      { type: "eq" as const, key: "key", value: "value" },
      { type: "gt" as const, key: "key2", value: 1 },
      { type: "gte" as const, key: "key3", value: 2 },
      { type: "lt" as const, key: "key4", value: 3 },
      { type: "lte" as const, key: "key5", value: 4 },
      { type: "neq" as const, key: "key6", value: "value6" },
    ]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && key2 > 1 && key3 >= 2 && key4 < 3 && key5 <= 4 && key6 != "value6"`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process multiple predicates - nested with or", async () => {
    const predicates = [
      { type: "eq" as const, key: "key", value: "value" },
      {
        type: "or" as const,
        predicates: [
          { type: "eq" as const, key: "key2", value: "value2" },
          { type: "eq" as const, key: "key3", value: "value3" },
        ],
      },
    ]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && (key2 = "value2" || key3 = "value3")`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process multiple predicates - nested with and", async () => {
    const predicates = [
      { type: "eq" as const, key: "key", value: "value" },
      {
        type: "and" as const,
        predicates: [
          { type: "eq" as const, key: "key2", value: "value2" },
          { type: "eq" as const, key: "key3", value: "value3" },
        ],
      },
    ]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && (key2 = "value2" && key3 = "value3")`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process multiple predicates - nested with and and or", async () => {
    const predicates = [
      { type: "eq" as const, key: "key", value: "value" },
      {
        type: "and" as const,
        predicates: [
          { type: "eq" as const, key: "key2", value: "value2" },
          {
            type: "or" as const,
            predicates: [
              { type: "eq" as const, key: "key3", value: "value3" },
              { type: "eq" as const, key: "key4", value: "value4" },
            ],
          },
        ],
      },
    ]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && (key2 = "value2" && (key3 = "value3" || key4 = "value4"))`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process simple predicates with ownedBy", async () => {
    const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
    await processQuery(client, {
      predicates,
      orderBy: undefined,
      limit: undefined,
      cursor: undefined,
      ownedBy: "0x123",
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && $owner=0x123`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process only ownedBy", async () => {
    const predicates = [] as Predicate[]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
      ownedBy: "0x123",
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `$owner=0x123`,
        {
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process simple predicates with orderBy", async () => {
    const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
    await processQuery(client, {
      predicates,
      orderBy: [{ name: "key", type: "string", desc: true }],
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value"`,
        {
          orderBy: [{ name: "key", type: "string", desc: true }],
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process only orderBy", async () => {
    const predicates = [] as Predicate[]
    await processQuery(client, {
      predicates,
      limit: undefined,
      cursor: undefined,
      ownedBy: undefined,
      orderBy: [{ name: "key", type: "string", desc: true }],
      validAtBlock: undefined,
      withAttributes: undefined,
      withMetadata: undefined,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        "",
        {
          orderBy: [{ name: "key", type: "string", desc: true }],
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should process simple predicate with validAtBlock and paging", async () => {
    const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
    await processQuery(client, {
      predicates,
      limit: 10,
      cursor: undefined,
      orderBy: undefined,
      validAtBlock: 123n,
      ownedBy: "0x123",
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && $owner=0x123`,
        {
          atBlock: 123,
          resultsPerPage: 10,
          includeData: {
            key: true,
            attributes: false,
            contentType: false,
            payload: false,
            expiration: false,
            owner: false,
            createdAtBlock: false,
            lastModifiedAtBlock: false,
            transactionIndexInBlock: false,
            operationIndexInTransaction: false,
          },
        },
      ],
    })
  })

  it("should includeData all metadata if withMetadata is true", async () => {
    const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
    await processQuery(client, {
      predicates,
      limit: 10,
      cursor: undefined,
      orderBy: undefined,
      validAtBlock: undefined,
      ownedBy: "0x123",
      withMetadata: true,
    })

    expect(client.request).lastCalledWith({
      method: "arkiv_query",
      params: [
        `key = "value" && $owner=0x123`,
        {
          resultsPerPage: 10,
          includeData: {
            key: true,
            attributes: false,
            contentType: true,
            payload: false,
            expiration: true,
            owner: true,
            createdAtBlock: true,
            lastModifiedAtBlock: true,
            transactionIndexInBlock: true,
            operationIndexInTransaction: true,
          },
        },
      ],
    })
  })
})
