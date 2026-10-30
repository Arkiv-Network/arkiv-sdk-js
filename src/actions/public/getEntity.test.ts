import { describe, expect, it, vi } from "bun:test"
import type { ArkivClient } from "../../clients/baseClient"
import { NoEntityFoundError } from "../../errors"
import { dec, defineSchema, InvalidValueError, str } from "../../schema"
import type { RpcEntity } from "../../types/rpcSchema"
import { getEntity } from "./getEntity"

const KEY = `0x${"ab".repeat(32)}` as const
const OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

/** A client whose `arkiv_getEntity` answers with `entity`. */
function makeClient(entity: RpcEntity | null) {
  const request = vi.fn(async () => entity)
  return { client: { request } as unknown as ArkivClient, request }
}

const entity: RpcEntity = {
  key: KEY,
  owner: OWNER,
  creator: OWNER,
  createdAt: "0x10",
  updatedAt: "0x11",
  expiresAt: "0x100",
  creationFlags: { readonly: false, permissionlessExtension: false, raw: 0 },
  attributes: [
    { name: "category", type: "str", value: "docs" },
    { name: "score", type: "dec", value: "4.5" },
  ],
}

describe("getEntity", () => {
  it("reads through arkiv_getEntity rather than a query", async () => {
    const { client, request } = makeClient(entity)
    await getEntity(client, KEY)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]).toEqual([{ method: "arkiv_getEntity", params: [KEY] }] as never)
  })

  it("returns every entity field and the attributes, but not the attribute schema", async () => {
    const { client } = makeClient(entity)
    const row = await getEntity(client, KEY)
    expect(row.$key).toBe(KEY)
    expect(row.$expiresAt).toBe(0x100n)
    expect(row.$creationFlags.readonly).toBe(false)
    expect(row.$attributes).toEqual({ category: str("docs"), score: dec("4.5") })
    expect(row).not.toHaveProperty("$attributeSchema")
    // @ts-expect-error - a single read describes the entity, not its shape
    row.$attributeSchema
  })

  it("reads through a schema", async () => {
    const { client } = makeClient(entity)
    const Posts = defineSchema({ category: str().indexed(), score: dec() })
    const row = await getEntity(client, KEY, Posts)
    expect(row.category).toEqual(str("docs"))
    expect(row.score).toEqual(dec("4.5"))
  })

  it("throws NoEntityFoundError when the node answers null", async () => {
    const { client } = makeClient(null)
    await expect(getEntity(client, KEY)).rejects.toThrow(NoEntityFoundError)
  })

  it("rejects a key that is not 32 bytes before asking the node", async () => {
    const { client, request } = makeClient(entity)
    await expect(getEntity(client, "0x1234")).rejects.toThrow(InvalidValueError)
    expect(request).not.toHaveBeenCalled()
  })
})
