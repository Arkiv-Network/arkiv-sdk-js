import { describe, expect, it, vi } from "bun:test"
import type { ArkivClient } from "../clients/baseClient"
import { dec, defineSchema, str } from "../schema"
import { CountQueryBuilder } from "./countBuilder"
import { InvalidPredicateError } from "./errors"
import { eq, gt } from "./expression"

const ACCOUNT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const
const Posts = defineSchema("my-app.posts", { category: str().indexed(), score: dec().indexed() })

/** A client whose `arkiv_query` answers with `result`. */
function makeClient(result: unknown = { data: [], blockNumber: "0x5", count: "0x2a" }) {
  const request = vi.fn(async () => result)
  return { client: { request } as unknown as ArkivClient, request }
}

/** The `[queryString, options]` of the first `arkiv_query` call. */
function sent(request: ReturnType<typeof makeClient>["request"]) {
  const [[call]] = request.mock.calls as unknown as [
    [{ method: string; params: [string, Record<string, unknown>] }],
  ]
  return { method: call.method, query: call.params[0], options: call.params[1] }
}

describe("CountQueryBuilder", () => {
  it("asks for the count alone and resolves to it", async () => {
    const { client, request } = makeClient()
    const total = await new CountQueryBuilder(client).where(eq("category", "news")).fetch()

    expect(total).toBe(42n)
    expect(sent(request).method).toBe("arkiv_query")
    expect(sent(request).query).toBe("category = str('news')")
    // Nothing but the count is selected, so the node sends no rows.
    expect(sent(request).options).toEqual({ select: { count: true } })
  })

  it("filters as select() does: schema tag, where, owner and creator", async () => {
    const { client, request } = makeClient()
    await new CountQueryBuilder(client)
      .from(Posts)
      .where(gt("score", dec("4")))
      .ownedBy(ACCOUNT)
      .createdBy(ACCOUNT)
      .fetch()

    expect(sent(request).query).toBe(
      "arkiv.schema = str('my-app.posts') AND score > dec(4) AND " +
        `$owner = addr(${ACCOUNT}) AND $creator = addr(${ACCOUNT})`,
    )
    expect(sent(request).options).toEqual({ select: { count: true } })
  })

  it("needs no other filter through a named schema", async () => {
    const { client, request } = makeClient()
    await new CountQueryBuilder(client).from(Posts).fetch()
    expect(sent(request).query).toBe("arkiv.schema = str('my-app.posts')")
  })

  it("checks filters against the schema, at compile time and when it runs", async () => {
    const { client } = makeClient()
    // @ts-expect-error - score is a dec column
    const wrongType = new CountQueryBuilder(client).from(Posts).where(eq("score", 5))
    await expect(wrongType.fetch()).rejects.toThrow(InvalidPredicateError)
  })

  it("rejects a count with no filter at all", async () => {
    const { client, request } = makeClient()
    await expect(new CountQueryBuilder(client).fetch()).rejects.toThrow(InvalidPredicateError)
    expect(request).not.toHaveBeenCalled()
  })

  it("fails rather than guessing when the node sends no count", async () => {
    const { client } = makeClient({ data: [], blockNumber: "0x1" })
    await expect(new CountQueryBuilder(client).where(eq("a", 1)).fetch()).rejects.toThrow(
      /returned no count/,
    )
  })

  it("leaves the builder from() was called on without the schema", async () => {
    const { client, request } = makeClient()
    const base = new CountQueryBuilder(client).where(eq("category", "news"))
    await base.from(Posts).fetch()
    await base.fetch()
    const [, second] = request.mock.calls as unknown as [
      unknown,
      [{ params: [string, Record<string, unknown>] }],
    ]
    expect(second[0].params[0]).toBe("category = str('news')")
  })
})
