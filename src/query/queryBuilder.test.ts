import { describe, expect, it, vi } from "bun:test"
import type { Hex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import { NoMoreResultsError } from "../errors"
import {
  type AddrValue,
  type ArkivValue,
  type Attributes,
  addr,
  type BytesValue,
  bytes,
  dec,
  defineSchema,
  i32,
  SchemaMismatchError,
  type StrValue,
  str,
} from "../schema"
import type { RpcEntity } from "../types/rpcSchema"
import { MAX_LIMIT } from "./engine"
import { InvalidPredicateError, QueryError } from "./errors"
import { eq, exists, gte, or } from "./expression"
import { SelectQueryBuilder } from "./queryBuilder"
import type { DynamicSelection, SelectArg, Selection } from "./selection"

const ACCOUNT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const
const KEY = `0x${"ab".repeat(32)}` as const

type Page = { data: RpcEntity[]; blockNumber: string; cursor?: string; count?: string }

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
    await new SelectQueryBuilder(client, { $key: true })
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
    await new SelectQueryBuilder(client, { $key: true }).where([eq("a", 1), eq("b", 2)]).fetch()
    expect(sent(request).query).toBe("a = i32(1) AND b = i32(2)")
  })

  it("turns ownedBy and createdBy into typed system predicates", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { $key: true })
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
    await new SelectQueryBuilder(client, { $key: true }).ownedBy(ACCOUNT).ownedBy(other).fetch()
    expect(sent(request).query).toBe(`$owner = addr(${other})`)
  })

  it("is readable without running anything", () => {
    const { client } = makeClient()
    const builder = new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1))
    expect(builder.toString()).toBe("a = i32(1)")
    expect(`${builder}`).toBe("a = i32(1)")
  })

  it("refuses a query with no filter, which the language cannot spell", async () => {
    const { client, request } = makeClient()
    const builder = new SelectQueryBuilder(client, { $key: true })
    expect(() => builder.toString()).toThrow(InvalidPredicateError)
    await expect(builder.fetch()).rejects.toThrow(/at least one filter/)
    expect(request).not.toHaveBeenCalled()
  })
})

describe("the options it sends", () => {
  it("sends the resolved selection, and nothing else by default", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { $key: true, $attributes: true })
      .where(eq("a", 1))
      .fetch()

    const { options } = sent(request)
    expect(options).toEqual({ select: expect.objectContaining({ key: true, attributes: true }) })
    // No limit, cursor or atBlock unless asked for — the node picks its own page size.
    expect(Object.keys(options).sort()).toEqual(["select"])
  })

  it("sends limit, cursor and atBlock as the RPC spells them", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { $key: true })
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
    const query = () => new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1))
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

describe("withCount", () => {
  it("carries the total on every page, typed bigint", async () => {
    const { client, request } = makeClient(
      { data: [{ key: KEY }], blockNumber: "0x1", cursor: "b64:next", count: "0x2" },
      { data: [{ key: KEY }], blockNumber: "0x1", count: "0x2" },
    )
    const first = await new SelectQueryBuilder(client, { $key: true })
      .where(eq("a", 1))
      .withCount()
      .limit(1)
      .fetch()
    const second = await first.next()

    const total: bigint = first.count
    const again: bigint = second.count
    expect(total).toBe(2n)
    expect(again).toBe(2n)
    expect(sent(request, 0).options.select).toMatchObject({ key: true, count: true })
    expect(sent(request, 1).options.select).toMatchObject({ key: true, count: true })
  })

  it("fails rather than typing a missing count as bigint", async () => {
    const { client } = makeClient({ data: [], blockNumber: "0x1" })
    await expect(
      new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1)).withCount().fetch(),
    ).rejects.toThrow(/returned no count/)
  })

  it("leaves count undefined, in the type too, unless asked for", async () => {
    const { client, request } = makeClient({ data: [], blockNumber: "0x1" })
    const page = await new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1)).fetch()
    const nothing: undefined = page.count
    expect(nothing).toBeUndefined()
    expect(sent(request).options.select).not.toHaveProperty("count")
  })

  it("survives from(), and leaves the builder it was called on uncounted", async () => {
    const Posts = defineSchema("posts", { category: str().indexed() })
    const { client, request } = makeClient({ data: [], blockNumber: "0x1", count: "0x0" })
    const base = new SelectQueryBuilder(client, { $key: true }).where(eq("category", "news"))
    const counted = base.withCount().from(Posts)
    const page = await counted.fetch()
    const total: bigint = page.count
    expect(total).toBe(0n)
    await base.fetch()
    expect(sent(request, 1).options.select).not.toHaveProperty("count")
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
          attributeSchema: [
            { name: "version", type: "i32", indexed: true },
            { name: "body", type: "bytes", indexed: false },
          ],
          attributes: [
            { name: "projectId", type: "str", value: "alice-123" },
            { name: "version", type: "i32", value: 4 },
            { name: "balance", type: "u256", value: "0xf4240" },
            { name: "score", type: "dec", value: "3.5" },
            { name: "body", type: "bytes", value: "0x7b7d" },
          ],
        },
      ],
    })

    const page = await new SelectQueryBuilder(client, {
      $key: true,
      $expiresAt: true,
      $creationFlags: true,
      $creator: true,
      $createdAt: true,
      $attributes: true,
      $attributeSchema: true,
    })
      .where(eq("a", 1))
      .fetch()
    const entity = page.entities[0]

    expect(entity.$key).toBe(KEY)
    expect(entity.$expiresAt).toBe(0x92e21n)
    expect(entity.$creationFlags).toEqual({
      readonly: false,
      permissionlessExtension: true,
      raw: 2,
    })
    expect(entity.$attributes).toEqual({
      projectId: { type: "str", value: "alice-123" },
      version: { type: "i32", value: 4 },
      balance: { type: "u256", value: 1_000_000n },
      score: { type: "dec", value: "3.5" },
      body: { type: "bytes", value: "0x7b7d" },
    })
    expect(entity.$attributeSchema).toEqual({
      version: { type: "i32", indexed: true },
      body: { type: "bytes", indexed: false },
    })
    // Unselected stays undefined rather than becoming an empty value.
    expect(entity.$creator).toBeUndefined()
    expect(entity.$createdAt).toBeUndefined()
    expect(page.blockNumber).toBe(0x8e1ffn)
  })

  it("leaves indexed undefined when the node does not say, rather than guessing", async () => {
    const { client } = makeClient({
      blockNumber: "0x1",
      data: [{ key: KEY, attributeSchema: [{ name: "version", type: "i32" }] }],
    })
    const page = await new SelectQueryBuilder(client, { $attributeSchema: true })
      .where(eq("a", 1))
      .fetch()
    expect(page.entities[0].$attributeSchema).toEqual({
      version: { type: "i32", indexed: undefined },
    })
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
    const builder = new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1)).limit(2)

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
    const first = await new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1)).fetch()
    await first.next()
    // next() returns the following page rather than mutating this one.
    expect(first.entities).toHaveLength(1)
    expect(first.cursor).toBe("b64:1")
  })

  it("reports a full last page correctly", async () => {
    // The old heuristic was "fewer rows than the limit means the end", which mistakes a final page
    // that happens to be exactly full for a middle one. The node omits the cursor instead.
    const { client } = makeClient(page(undefined, "0x1", "0x2"))
    const result = await new SelectQueryBuilder(client, { $key: true })
      .where(eq("a", 1))
      .limit(2)
      .fetch()
    expect(result.entities).toHaveLength(2)
    expect(result.hasNextPage()).toBe(false)
  })

  it("pages the query it started with, not whatever the builder says later", async () => {
    const { client, request } = makeClient(page("b64:1", "0x1"), page(undefined, "0x2"))
    const builder = new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1))

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
    for await (const entity of new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1))) {
      keys.push((entity as { $key: string }).$key)
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

    const promise = new SelectQueryBuilder(client, { $key: true }).where(eq("a", 1)).fetch()
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
      const error = await new SelectQueryBuilder(client, { $key: true })
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

    const error = await new SelectQueryBuilder(client, { $key: true })
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
      data: [{ key: KEY, owner: ACCOUNT }],
    })

    const page = await new SelectQueryBuilder<{ $key: true; $owner: true }>(client, {
      $key: true,
      $owner: true,
    })
      .where(eq("a", 1))
      .fetch()

    const entity = page.entities[0]
    expectType<Hex>(entity.$key)
    expectType<Hex>(entity.$owner)
    // @ts-expect-error - creator was not selected
    entity.$creator
  })

  it("reads every attribute as a map with $attributes", async () => {
    const { client } = makeClient({
      blockNumber: "0x1",
      data: [{ key: KEY, attributes: [{ name: "version", type: "i32", value: 4 }] }],
    })
    const page = await new SelectQueryBuilder<{ $key: true; $attributes: true }>(client, {
      $key: true,
      $attributes: true,
    })
      .where(eq("a", 1))
      .fetch()

    expectType<Attributes>(page.entities[0].$attributes)
    expect(page.entities[0].$attributes).toEqual({ version: { type: "i32", value: 4 } })
  })
})

describe("through a schema", () => {
  /** Builds the way `client.select` does, so the selection is inferred as a literal. */
  const select = <const S extends Selection>(client: ArkivClient, selection: S) =>
    new SelectQueryBuilder<S>(client, selection)

  const Posts = defineSchema({
    author: addr().indexed(),
    category: str().indexed(),
    score: dec().indexed(),
    title: str(),
    body: bytes(),
    thumbnail: bytes().optional(),
  })

  const row: RpcEntity = {
    key: KEY,
    owner: ACCOUNT,
    attributes: [
      { name: "author", type: "addr", value: ACCOUNT },
      { name: "title", type: "str", value: "Hello" },
      { name: "body", type: "bytes", value: "0x2348" },
    ],
  }

  it("asks for the selected columns by name, alongside the entity fields", async () => {
    const { client, request } = makeClient()
    await select(client, { $key: true, title: true, body: true })
      .from(Posts)
      .where(eq("category", "docs"))
      .fetch()
    expect(sent(request).options.select).toMatchObject({
      key: true,
      owner: false,
      attributes: { title: true, body: true },
    })
  })

  it("returns flat rows with each column typed by the schema", async () => {
    const { client } = makeClient({ blockNumber: "0x1", data: [row] })
    const page = await select(client, {
      $key: true,
      author: true,
      title: true,
      body: true,
      thumbnail: true,
    })
      .from(Posts)
      .where(eq("category", "docs"))
      .fetch()

    const [first] = page.entities
    expect(first).toEqual({
      $key: KEY,
      author: addr(ACCOUNT),
      title: str("Hello"),
      body: bytes("0x2348"),
      thumbnail: undefined,
    })
    expectType<Hex>(first.$key)
    expectType<AddrValue>(first.author)
    expectType<StrValue>(first.title)
    expectType<BytesValue>(first.body)
    expectType<BytesValue | undefined>(first.thumbnail)
    // @ts-expect-error - score was not selected
    first.score
  })

  it("decodes every page of a walk as rows", async () => {
    const { client } = makeClient(
      { blockNumber: "0x1", data: [row], cursor: "next" },
      { blockNumber: "0x1", data: [row] },
    )
    const titles: string[] = []
    for await (const entry of select(client, { title: true })
      .from(Posts)
      .where(eq("category", "docs"))) {
      titles.push(entry.title.value)
    }
    expect(titles).toEqual(["Hello", "Hello"])
  })

  it("fails the fetch on an entity that does not fit the schema, with onMismatch: throw", async () => {
    const { client } = makeClient({
      blockNumber: "0x1",
      data: [{ key: KEY, attributes: [{ name: "author", type: "addr", value: ACCOUNT }] }],
    })
    await expect(
      select(client, { $key: true, title: true })
        .from(Posts, { onMismatch: "throw" })
        .where(eq("category", "docs"))
        .fetch(),
    ).rejects.toThrow(SchemaMismatchError)
  })

  it("checks the filters against the schema before sending anything", async () => {
    const { client, request } = makeClient()
    const builder = select(client, { $key: true }).from(Posts)
    // @ts-expect-error - title is not indexed
    await expect(builder.where(eq("title", "Hello")).fetch()).rejects.toThrow(/not indexed/)
    const bytesFilter = select(client, { $key: true }).from(Posts)
    // @ts-expect-error - body is bytes, which is never indexed
    await expect(bytesFilter.where(exists("body")).fetch()).rejects.toThrow(/never indexed/)
    expect(request).not.toHaveBeenCalled()
  })

  it("rejects a selection naming something the schema does not have, at from()", () => {
    const { client } = makeClient()
    expect(() =>
      select(client, { $key: true, nope: true })
        // @ts-expect-error - nope is not a column
        .from(Posts),
    ).toThrow(/"nope", which is not a column/)
  })

  it("checks a selection built at runtime when from() is called", () => {
    const { client } = makeClient()
    const selection: SelectArg = JSON.parse('{"$key": true, "nope": true}')
    expect(() => new SelectQueryBuilder(client, selection).from(Posts)).toThrow(
      /"nope", which is not a column/,
    )
  })

  it("sends the selection as it was when select() was called", async () => {
    const { client, request } = makeClient()
    const selection: Record<string, boolean> = { $key: true, title: true }
    const builder = new SelectQueryBuilder(client, selection as Selection).from(Posts)
    selection.author = true
    await builder.where(eq("category", "docs")).fetch()
    expect(sent(request).options.select).toMatchObject({ attributes: { title: true } })
  })

  it("carries the filters, owner, limit, cursor and block across from()", async () => {
    const { client, request } = makeClient()
    await new SelectQueryBuilder(client, { $key: true })
      .where(eq("category", "docs"))
      .ownedBy(ACCOUNT)
      .limit(5)
      .cursor("0xc0")
      .atBlock(7n)
      .from(Posts)
      .fetch()
    const { query, options } = sent(request)
    expect(query).toBe(`category = str('docs') AND $owner = addr(${ACCOUNT})`)
    expect(options).toMatchObject({ limit: "0x5", cursor: "0xc0", atBlock: "0x7" })
  })

  it("reads the same selection without a schema, untyped and unchecked", async () => {
    const misfit = { key: KEY, attributes: [{ name: "title", type: "i32", value: 7 }] }
    const { client, request } = makeClient({ blockNumber: "0x1", data: [row, misfit] })
    const page = await select(client, { $key: true, title: true, body: true })
      .where(eq("category", "docs"))
      .fetch()

    expect(sent(request).options.select).toMatchObject({
      key: true,
      attributes: { title: true, body: true },
    })
    // The same flat rows as through a schema; without one, nothing is checked, so the misfit
    // comes back as it is and a missing attribute as undefined.
    expect(page.entities).toEqual([
      { $key: KEY, title: str("Hello"), body: bytes("0x2348") },
      { $key: KEY, title: i32(7), body: undefined },
    ])
    const title: ArkivValue | undefined = page.entities[0]?.title
    expect(title).toEqual(str("Hello"))
  })

  it("skips a mismatch by default, and throws on it with onMismatch: throw", async () => {
    // Anyone can write an entity a query matches but the schema does not fit, so one such entity
    // must not fail every read of the others unless the caller asks for that.
    const misfit = { key: KEY, attributes: [{ name: "author", type: "addr", value: ACCOUNT }] }
    const pages = () => makeClient({ blockNumber: "0x1", data: [row, misfit, row] }).client

    const page = await select(pages(), { $key: true, title: true })
      .from(Posts)
      .where(eq("category", "docs"))
      .fetch()
    expect(page.entities.map((entry) => entry.title.value)).toEqual(["Hello", "Hello"])
    expect(page.skipped).toBe(1)

    await expect(
      select(pages(), { $key: true, title: true })
        .from(Posts, { onMismatch: "throw" })
        .where(eq("category", "docs"))
        .fetch(),
    ).rejects.toThrow(SchemaMismatchError)
  })

  it("still throws errors that are not mismatches when skipping", async () => {
    const { client } = makeClient({
      blockNumber: "0x1",
      data: [{ key: KEY, attributes: [{ name: "title", type: "nope", value: 1 }] }],
    })
    await expect(
      select(client, { title: true })
        .from(Posts, { onMismatch: "skip" })
        .where(eq("category", "docs"))
        .fetch(),
    ).rejects.toThrow(/Unknown attribute type/)
  })

  it("skips on every page of a walk", async () => {
    const misfit = { key: KEY, attributes: [] }
    const { client } = makeClient(
      { blockNumber: "0x1", data: [misfit], cursor: "next" },
      { blockNumber: "0x1", data: [row] },
    )
    const titles: string[] = []
    for await (const entry of select(client, { title: true })
      .from(Posts, { onMismatch: "skip" })
      .where(eq("category", "docs"))) {
      titles.push(entry.title.value)
    }
    expect(titles).toEqual(["Hello"])
  })

  it("counts skips per page, so an empty page with a cursor is not mistaken for the end", async () => {
    const misfit = { key: KEY, attributes: [] }
    const { client } = makeClient(
      { blockNumber: "0x1", data: [misfit, misfit], cursor: "next" },
      { blockNumber: "0x1", data: [row] },
    )
    const first = await select(client, { title: true })
      .from(Posts, { onMismatch: "skip" })
      .where(eq("category", "docs"))
      .fetch()
    expect(first.entities).toEqual([])
    expect(first.skipped).toBe(2)
    expect(first.hasNextPage()).toBe(true)

    const second = await first.next()
    expect(second.entities).toHaveLength(1)
    expect(second.skipped).toBe(0)
  })

  it("reports nothing skipped when not skipping, or without a schema", async () => {
    const throughSchema = await select(makeClient({ blockNumber: "0x1", data: [row] }).client, {
      title: true,
    })
      .from(Posts)
      .where(eq("category", "docs"))
      .fetch()
    expect(throughSchema.skipped).toBe(0)

    const plain = await new SelectQueryBuilder(makeClient().client, { $key: true })
      .where(eq("category", "docs"))
      .fetch()
    expect(plain.skipped).toBe(0)
  })

  it("leaves the builder it was called on untouched, so two schemas never share one", async () => {
    const Users = defineSchema("users", { category: str().indexed(), name: str() })
    const { client, request } = makeClient()
    const base = new SelectQueryBuilder(client, "*").limit(5)
    const posts = base.from(Posts).where(eq("category", "docs"))
    const users = base.from(Users)

    expect(posts).not.toBe(base)
    expect(users).not.toBe(posts)
    await users.where(eq("category", "people")).fetch()
    await posts.fetch()
    // Each carried what `base` held when it was made, and nothing the other added since.
    expect(sent(request, 0).query).toBe("arkiv.schema = str('users') AND category = str('people')")
    expect(sent(request, 0).options.limit).toBe("0x5")
    expect(sent(request, 1).query).toBe("category = str('docs')")
    expect(() => base.toString()).toThrow(/at least one filter/)
  })

  it("types a dynamic selection's rows with every field optional", async () => {
    const { client } = makeClient({ blockNumber: "0x1", data: [row] })
    const selection: SelectArg = { $key: true }
    const page = await new SelectQueryBuilder<DynamicSelection>(client, selection)
      .from(Posts)
      .where(eq("category", "docs"))
      .fetch()
    const [first] = page.entities
    expectType<StrValue | undefined>(first.title)
    expect(first).toEqual({ $key: KEY })
  })

  it("rejects an onMismatch it does not know", () => {
    const { client } = makeClient()
    expect(() =>
      select(client, { title: true }).from(Posts, { onMismatch: "ignore" as never }),
    ).toThrow(/"throw" or "skip"/)
  })

  it("rejects something that is not a schema", () => {
    const { client } = makeClient()
    expect(() =>
      new SelectQueryBuilder(client, "*").from({ columns: {} } as unknown as typeof Posts),
    ).toThrow(/defineSchema/)
  })
})

describe("through a named schema", () => {
  const Posts = defineSchema("posts", { category: str().indexed(), title: str() })
  const select = <const S extends Selection>(client: ArkivClient, selection: S) =>
    new SelectQueryBuilder<S>(client, selection)

  it("filters on the schema's tag, ahead of everything else", async () => {
    const { client, request } = makeClient()
    await select(client, { $key: true }).from(Posts).where(eq("category", "docs")).fetch()
    expect(sent(request).query).toBe("arkiv.schema = str('posts') AND category = str('docs')")
  })

  it("needs no other filter, so it can list every entity of the schema", async () => {
    const { client, request } = makeClient()
    await select(client, { $key: true }).from(Posts).fetch()
    expect(sent(request).query).toBe("arkiv.schema = str('posts')")
  })

  it("checks the caller's filters, not the tag it adds itself", async () => {
    const { client } = makeClient()
    const builder = select(client, { $key: true }).from(Posts)
    // @ts-expect-error - arkiv.schema is not a column
    builder.where(eq("arkiv.schema", "comments"))
    await expect(builder.fetch()).rejects.toThrow(/"arkiv.schema" is not a column/)
  })

  it("leaves an unnamed schema's query to its filters alone", async () => {
    const { client, request } = makeClient()
    await select(client, { $key: true })
      .from(defineSchema({ category: str().indexed() }))
      .where(eq("category", "docs"))
      .fetch()
    expect(sent(request).query).toBe("category = str('docs')")
  })
})

/** Asserts the static type of an expression without touching it at runtime. */
function expectType<T>(_value: T): void {}
