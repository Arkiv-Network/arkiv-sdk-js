import { describe, expect, it, vi } from "bun:test"
import type { Hex } from "viem"
import { type Attributes, i32 } from "../attr"
import type { ArkivClient } from "../clients/baseClient"
import { NoMoreResultsError } from "../errors"
import type { RpcEntity } from "../types/rpcSchema"
import { MAX_LIMIT } from "./engine"
import { InvalidPredicateError, QueryError } from "./errors"
import { eq, gte, or } from "./expression"
import { SelectQueryBuilder } from "./queryBuilder"
import type { ProjectedEntity } from "./selection"

const ACCOUNT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
const KEY = `0x${"ab".repeat(32)}` as const

type Page = { data: RpcEntity[]; blockNumber: string; cursor?: string }

/** A client whose `arkiv_query` serves the given pages in order. */
function makeClient(...pages: Page[]) {
  const served = pages.length > 0 ? pages : [{ data: [], blockNumber: "0x1" }]
  let index = 0
  const request = vi.fn(async () => served[Math.min(index++, served.length - 1)])
  return { client: { request } as unknown as ArkivClient, request }
}

/** The `[queryString, options]` of the nth `arkiv_query` call. */
function sent(request: ReturnType<typeof makeClient>["request"], call = 0) {
  const params = request.mock.calls[call][0] as unknown as {
    method: string
    params: [string, Record<string, unknown>]
  }
  return { method: params.method, query: params.params[0], options: params.params[1] }
}

describe("the query it sends", () => {
  it("ANDs everything across repeated where() calls", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { key: true })
      .where(gte("level", i32(10)))
      .where(eq("category", "docs"), or(eq("status", "open"), eq("status", "review")))
      .fetch()

    expect(sent(request).method).toBe("arkiv_query")
    expect(sent(request).query).toBe(
      "level >= i32(10) AND category = str('docs') AND " +
        "(status = str('open') OR status = str('review'))",
    )
  })

  it("takes an array of expressions", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { key: true }).where([eq("a", 1), eq("b", 2)]).fetch()
    expect(sent(request).query).toBe("a = i32(1) AND b = i32(2)")
  })

  it("turns ownedBy and createdBy into typed system predicates", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { key: true })
      .where(eq("category", "docs"))
      .ownedBy(ACCOUNT)
      .createdBy(ACCOUNT)
      .fetch()

    expect(sent(request).query).toBe(
      `category = str('docs') AND $owner = addr(${ACCOUNT}) AND $creator = addr(${ACCOUNT})`,
    )
  })

  it("replaces rather than ANDs a second ownedBy — two owners would match nothing", async () => {
    const other = "0x1111111111111111111111111111111111111111"
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { key: true }).ownedBy(ACCOUNT).ownedBy(other).fetch()
    expect(sent(request).query).toBe(`$owner = addr(${other})`)
  })

  it("is readable without running anything", () => {
    const { client } = makeClient()
    const builder = new SelectQueryBuilder(client, { key: true }).where(eq("a", 1))
    expect(builder.toString()).toBe("a = i32(1)")
    expect(`${builder}`).toBe("a = i32(1)")
  })

  it("refuses a query with no filter, which the language cannot spell", async () => {
    const { client, request } = makeClient()
    const builder = new SelectQueryBuilder(client, { key: true })
    expect(() => builder.toString()).toThrow(InvalidPredicateError)
    await expect(builder.fetch()).rejects.toThrow(/at least one filter/)
    expect(request).not.toHaveBeenCalled()
  })
})

describe("the options it sends", () => {
  it("sends the resolved selection, and nothing else by default", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { key: true, attributes: true }).where(eq("a", 1)).fetch()

    const { options } = sent(request)
    expect(options).toEqual({ select: expect.objectContaining({ key: true, attributes: true }) })
    // No limit, cursor or atBlock unless asked for — the node picks its own page size.
    expect(Object.keys(options).sort()).toEqual(["select"])
  })

  it("sends limit, cursor and atBlock as the RPC spells them", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { key: true })
      .where(eq("a", 1))
      .limit(100)
      .cursor("b64:abc")
      .atBlock(1_297_000n)
      .fetch()

    const { options } = sent(request)
    expect(options).toMatchObject({
      limit: "0x64",
      cursor: "b64:abc",
      atBlock: "0x13ca68",
    })
  })

  it("rejects a page size the node would reject", async () => {
    const { client, request } = makeClient()
    const query = () => new SelectQueryBuilder(client, { key: true }).where(eq("a", 1))
    await expect(
      query()
        .limit(MAX_LIMIT + 1)
        .fetch(),
    ).rejects.toThrow(/exceeds the node maximum/)
    await expect(query().limit(0).fetch()).rejects.toThrow(/positive integer/)
    await expect(query().limit(1.5).fetch()).rejects.toThrow(/positive integer/)
    expect(query().limit(MAX_LIMIT)).toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })
})

describe("decoding", () => {
  it("builds entities from exactly the fields the row carries", async () => {
    const { client } = makeClient({
      blockNumber: "0x8e1ff",
      data: [
        {
          key: KEY,
          owner: ACCOUNT,
          expiresAt: "0x92e21",
          creationFlags: { readonly: false, permissionlessExtension: true, raw: 2 },
          contentType: "application/json",
          payload: "0x7b7d",
          attributeSchema: [{ name: "version", type: "i32" }],
          attributes: [
            { name: "projectId", type: "str", value: "alice-123" },
            { name: "version", type: "i32", value: 4 },
            { name: "balance", type: "u256", value: "0xf4240" },
            { name: "score", type: "dec", value: "3.5" },
          ],
        },
      ],
    })

    const page = await new SelectQueryBuilder(client, "*").where(eq("a", 1)).fetch()
    const entity = page.entities[0]

    expect(entity.key).toBe(KEY)
    expect(entity.expiresAt).toBe(0x92e21n)
    expect(entity.creationFlags).toEqual({
      readonly: false,
      permissionlessExtension: true,
      raw: 2,
    })
    expect(entity.attributes).toEqual({
      projectId: { type: "str", value: "alice-123" },
      version: { type: "i32", value: 4 },
      balance: { type: "u256", value: 1_000_000n },
      score: { type: "dec", value: "3.5" },
    })
    expect(entity.attributeSchema).toEqual({ version: "i32" })
    expect(entity.toJson()).toEqual({})
    // Unselected stays undefined rather than becoming an empty value.
    expect(entity.creator).toBeUndefined()
    expect(entity.createdAt).toBeUndefined()
    expect(page.blockNumber).toBe(0x8e1ffn)
  })
})

describe("pagination", () => {
  const page = (cursor: string | undefined, ...keys: string[]): Page => ({
    blockNumber: "0x8e1ff",
    data: keys.map((k) => ({ key: k as `0x${string}` })),
    ...(cursor !== undefined && { cursor }),
  })

  it("follows the cursor and stops when the node omits it", async () => {
    const { client, request } = makeClient(
      page("b64:1", "0x1", "0x2"),
      page("b64:2", "0x3"),
      page(undefined, "0x4"),
    )
    const builder = new SelectQueryBuilder(client, { key: true }).where(eq("a", 1)).limit(2)

    const first = await builder.fetch()
    expect(first.entities).toHaveLength(2)
    expect(first.hasNextPage()).toBe(true)

    const second = await first.next()
    expect(sent(request, 1).options).toMatchObject({ cursor: "b64:1" })

    const third = await second.next()
    expect(sent(request, 2).options).toMatchObject({ cursor: "b64:2" })
    expect(third.hasNextPage()).toBe(false)
    await expect(third.next()).rejects.toThrow(NoMoreResultsError)
  })

  it("leaves an already-read page readable", async () => {
    const { client } = makeClient(page("b64:1", "0x1"), page(undefined, "0x2"))
    const first = await new SelectQueryBuilder(client, { key: true }).where(eq("a", 1)).fetch()
    await first.next()
    // next() returns the following page rather than mutating this one.
    expect(first.entities).toHaveLength(1)
    expect(first.cursor).toBe("b64:1")
  })

  it("reports a full last page correctly", async () => {
    // The old heuristic was "fewer rows than the limit means the end", which mistakes a final page
    // that happens to be exactly full for a middle one. The node omits the cursor instead.
    const { client } = makeClient(page(undefined, "0x1", "0x2"))
    const result = await new SelectQueryBuilder(client, { key: true })
      .where(eq("a", 1))
      .limit(2)
      .fetch()
    expect(result.entities).toHaveLength(2)
    expect(result.hasNextPage()).toBe(false)
  })

  it("pages the query it started with, not whatever the builder says later", async () => {
    const { client, request } = makeClient(page("b64:1", "0x1"), page(undefined, "0x2"))
    const builder = new SelectQueryBuilder(client, { key: true }).where(eq("a", 1))

    const first = await builder.fetch()
    // The builder stays mutable and reusable. Re-reading it per page would send page 2 under a
    // different query than the cursor was issued for, which the node answers with a "cursor" error
    // — or, worse, with rows from another result set.
    builder.where(eq("b", 2)).limit(50).atBlock(9n)
    await first.next()

    expect(sent(request, 1).query).toBe("a = i32(1)")
    expect(sent(request, 1).options).not.toHaveProperty("limit")
    expect(sent(request, 1).options).not.toHaveProperty("atBlock")
  })

  it("walks every page through the async iterator", async () => {
    const { client } = makeClient(page("b64:1", "0x1", "0x2"), page(undefined, "0x3"))
    const keys: unknown[] = []
    for await (const entity of new SelectQueryBuilder(client, { key: true }).where(eq("a", 1))) {
      keys.push((entity as { key: string }).key)
    }
    expect(keys).toEqual(["0x1", "0x2", "0x3"])
  })
})

describe("node rejections", () => {
  /** viem wraps the arkiv codes in its own EIP-1474 classes, so the code sits down the chain. */
  function rpcFailure(code: number, data?: unknown) {
    const inner = Object.assign(new Error("RPC Request failed."), { code, data })
    return Object.assign(new Error("Something went wrong."), {
      shortMessage: "Something went wrong.",
      cause: inner,
    })
  }

  it("names the failure and keeps the node's detail", async () => {
    const { client } = makeClient()
    const data = { position: 14, expected: "typed literal", got: "3.5" }
    ;(client.request as ReturnType<typeof vi.fn>).mockRejectedValue(rpcFailure(-32001, data))

    const promise = new SelectQueryBuilder(client, { key: true }).where(eq("a", 1)).fetch()
    await expect(promise).rejects.toThrow(QueryError)

    const error = (await promise.catch((e) => e)) as QueryError
    expect(error.kind).toBe("parse")
    expect(error.code).toBe(-32001)
    expect(error.data).toEqual(data)
    expect(error.query).toBe("a = i32(1)")
    expect(error.message).toContain("Query: a = i32(1)")
  })

  it("maps each code in the frozen range", async () => {
    const kinds = {
      [-32001]: "parse",
      [-32002]: "type",
      [-32003]: "literal",
      [-32004]: "limits",
      [-32005]: "cursor",
      [-32006]: "block",
    }
    for (const [code, kind] of Object.entries(kinds)) {
      const { client } = makeClient()
      ;(client.request as ReturnType<typeof vi.fn>).mockRejectedValue(rpcFailure(Number(code)))
      const error = await new SelectQueryBuilder(client, { key: true })
        .where(eq("a", 1))
        .fetch()
        .catch((e) => e)
      expect((error as QueryError).kind).toBe(kind as QueryError["kind"])
    }
  })

  it("leaves anything else alone", async () => {
    const { client } = makeClient()
    const transportFailure = new Error("fetch failed")
    ;(client.request as ReturnType<typeof vi.fn>).mockRejectedValue(transportFailure)

    const error = await new SelectQueryBuilder(client, { key: true })
      .where(eq("a", 1))
      .fetch()
      .catch((e) => e)
    expect(error).toBe(transportFailure)
  })
})

describe("the projected type", () => {
  // Compile-time only: these assertions fail the build, not the run.
  it("narrows the entity to exactly the selected fields", async () => {
    const { client } = makeClient({
      blockNumber: "0x1",
      data: [{ key: KEY, owner: ACCOUNT, payload: "0x7b7d" }],
    })

    const page = await new SelectQueryBuilder<ProjectedEntity<{ key: true; owner: true }>>(client, {
      key: true,
      owner: true,
    })
      .where(eq("a", 1))
      .fetch()

    const entity = page.entities[0]
    expectType<Hex>(entity.key)
    expectType<Hex>(entity.owner)
    // @ts-expect-error - creator was not selected
    entity.creator
    // @ts-expect-error - toJson comes with the payload, which was not selected
    entity.toJson()
  })

  it("keeps the payload helpers when the payload is selected", async () => {
    const { client } = makeClient({ blockNumber: "0x1", data: [{ payload: "0x7b7d" }] })
    const page = await new SelectQueryBuilder<ProjectedEntity<{ payload: true }>>(client, {
      payload: true,
    })
      .where(eq("a", 1))
      .fetch()

    expect(page.entities[0].toJson()).toEqual({})
    expectType<Uint8Array>(page.entities[0].payload)
  })

  it("treats a named attribute subset as a selection of attributes", async () => {
    const { client } = makeClient({
      blockNumber: "0x1",
      data: [{ key: KEY, attributes: [{ name: "version", type: "i32", value: 4 }] }],
    })
    const page = await new SelectQueryBuilder<
      ProjectedEntity<{ key: true; attributes: { version: true } }>
    >(client, { key: true, attributes: { version: true } })
      .where(eq("a", 1))
      .fetch()

    expectType<Attributes>(page.entities[0].attributes)
    expect(page.entities[0].attributes).toEqual({ version: { type: "i32", value: 4 } })
  })
})

/** Asserts the static type of an expression without touching it at runtime. */
function expectType<T>(_value: T): void {}
