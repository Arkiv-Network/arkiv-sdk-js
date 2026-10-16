import { describe, expect, it, vi } from "bun:test"
import type { ArkivClient } from "../../clients/baseClient"
import { i32, str } from "../../schema"
import type { RpcEntity } from "../../types/rpcSchema"
import { query } from "./query"

const KEY = `0x${"ab".repeat(32)}` as const

/** A client whose `arkiv_query` serves one page holding `data`. */
function makeClient(data: RpcEntity[]) {
  const request = vi.fn(async () => ({ data, blockNumber: "0x1" }))
  return { client: { request } as unknown as ArkivClient, request }
}

/** The RPC `select` object the first `arkiv_query` call sent. */
function sentSelect(request: ReturnType<typeof makeClient>["request"]) {
  const [[call]] = request.mock.calls as unknown as [[{ params: [string, { select: unknown }] }]]
  return call.params[1].select
}

describe("query", () => {
  const entity: RpcEntity = {
    key: KEY,
    attributes: [
      { name: "name", type: "str", value: "build" },
      { name: "runs", type: "i32", value: 3 },
    ],
  }

  it("returns the same flat rows select() does, attributes by name", async () => {
    const { client, request } = makeClient([entity])
    const page = await query(client, "type = str('execution')", {
      select: { $key: true, name: true, technology: true },
    })

    expect(sentSelect(request)).toMatchObject({
      key: true,
      attributes: { name: true, technology: true },
    })
    expect(page.entities).toEqual([{ $key: KEY, name: str("build"), technology: undefined }])
    expect(page.blockNumber).toBe(1n)
  })

  it("reads every field and the attributes map when nothing is selected", async () => {
    const { client } = makeClient([entity])
    const page = await query(client, "type = str('execution')")
    expect(page.entities[0]?.$key).toBe(KEY)
    expect(page.entities[0]?.$attributes).toEqual({ name: str("build"), runs: i32(3) })
  })

  it("rejects a selection that asks for nothing before sending it", async () => {
    const { client, request } = makeClient([])
    await expect(query(client, "a = i32(1)", { select: { $key: false } })).rejects.toThrow(
      /at least one field/,
    )
    expect(request).not.toHaveBeenCalled()
  })
})
