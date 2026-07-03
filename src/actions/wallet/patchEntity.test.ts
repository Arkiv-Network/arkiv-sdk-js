import { expect, test, vi } from "bun:test"
import { toBytes, toHex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { CannotPreserveExpirationError, UnsafeNumericAttributeError } from "../../errors"
import { resolvePatchEntities, resolvePatchEntity, resolvePatches } from "./patchEntity"

const ENTITY_KEY = `0x${"11".repeat(32)}` as const

// entity at block 40 that expires at block 100 with a text payload,
// two string attributes and one numeric attribute
function mockClient({
  currentBlock = 40,
  // null means the entity has no expiration block (undefined would trigger
  // the default parameter value instead)
  expiresAt = "0x64" as string | null,
  stringAttributes = [
    { key: "keep", value: "kept" },
    { key: "replace", value: "old" },
  ],
  numericAttributes = [{ key: "num", value: "0x2a" }],
} = {}) {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "arkiv_query") {
      return {
        data: [
          {
            key: ENTITY_KEY,
            contentType: "application/json",
            value: toHex("old payload"),
            expiresAt: expiresAt ?? undefined,
            owner: ENTITY_KEY,
            creator: ENTITY_KEY,
            stringAttributes,
            numericAttributes,
          },
        ],
      }
    }
    if (method === "arkiv_getBlockTiming") {
      return { current_block: currentBlock, current_block_time: 2, duration: 2 }
    }
    throw new Error(`unexpected method ${method}`)
  })
  return { client: { request } as unknown as ArkivClient, request }
}

test("keeps omitted fields from the current entity", async () => {
  const { client } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    payload: toBytes("new payload"),
  })

  expect(update.entityKey).toEqual(ENTITY_KEY)
  expect(update.payload).toEqual(toBytes("new payload"))
  expect(update.contentType).toEqual("application/json")
  expect(update.attributes).toEqual([
    { key: "keep", value: "kept" },
    { key: "replace", value: "old" },
    { key: "num", value: 42 },
  ])
  // remaining lifetime preserved: (100 - 40) blocks * 2s
  expect(update.expiresIn).toEqual(120)
})

test("keeps the current payload when only attributes are patched", async () => {
  const { client } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [{ key: "added", value: "new" }],
  })

  expect(update.payload).toEqual(toBytes("old payload"))
})

test("merges attributes: appends new keys, replaces existing ones, keeps the rest", async () => {
  const { client } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [
      { key: "replace", value: "new" },
      { key: "added", value: 1 },
    ],
  })

  expect(update.attributes).toEqual([
    { key: "keep", value: "kept" },
    { key: "num", value: 42 },
    { key: "replace", value: "new" },
    { key: "added", value: 1 },
  ])
})

test("removes an attribute when its value is null", async () => {
  const { client } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [
      { key: "replace", value: null },
      { key: "added", value: "new" },
    ],
  })

  expect(update.attributes).toEqual([
    { key: "keep", value: "kept" },
    { key: "num", value: 42 },
    { key: "added", value: "new" },
  ])
})

test("removing a non-existent attribute is a no-op", async () => {
  const { client } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [{ key: "doesNotExist", value: null }],
  })

  expect(update.attributes).toEqual([
    { key: "keep", value: "kept" },
    { key: "replace", value: "old" },
    { key: "num", value: 42 },
  ])
})

test("replaces only the same-typed attribute when a key exists as both string and numeric", async () => {
  const { client } = mockClient({
    stringAttributes: [{ key: "v", value: "x" }],
    numericAttributes: [{ key: "v", value: "0x7" }],
  })
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [{ key: "v", value: 8 }],
  })

  expect(update.attributes).toEqual([
    { key: "v", value: "x" },
    { key: "v", value: 8 },
  ])
})

test("a null value removes both the string and the numeric attribute with that key", async () => {
  const { client } = mockClient({
    stringAttributes: [
      { key: "keep", value: "kept" },
      { key: "v", value: "x" },
    ],
    numericAttributes: [{ key: "v", value: "0x7" }],
  })
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [{ key: "v", value: null }],
  })

  expect(update.attributes).toEqual([{ key: "keep", value: "kept" }])
})

test("the last patch entry wins for duplicate keys of the same value type", async () => {
  const { client } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [
      { key: "status", value: "a" },
      { key: "status", value: "b" },
    ],
  })

  expect(update.attributes).toEqual([
    { key: "keep", value: "kept" },
    { key: "replace", value: "old" },
    { key: "num", value: 42 },
    { key: "status", value: "b" },
  ])
})

test("a removal followed by a set re-adds only the set value type", async () => {
  const { client } = mockClient({
    stringAttributes: [{ key: "v", value: "x" }],
    numericAttributes: [{ key: "v", value: "0x7" }],
  })
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [
      { key: "v", value: null },
      { key: "v", value: 8 },
    ],
  })

  expect(update.attributes).toEqual([{ key: "v", value: 8 }])
})

test("throws when an untouched numeric attribute exceeds Number.MAX_SAFE_INTEGER", async () => {
  const { client } = mockClient({
    // 2^63 - 1: Number() loses precision reading this back
    numericAttributes: [{ key: "big", value: "0x7fffffffffffffff" }],
  })
  expect(
    resolvePatchEntity(client, {
      entityKey: ENTITY_KEY,
      payload: toBytes("new payload"),
    }),
  ).rejects.toThrowError(UnsafeNumericAttributeError)
})

test("allows patching when the unsafe numeric attribute is overwritten or removed", async () => {
  const { client } = mockClient({
    numericAttributes: [{ key: "big", value: "0x7fffffffffffffff" }],
  })
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    attributes: [{ key: "big", value: 1 }],
  })
  expect(update.attributes).toContainEqual({ key: "big", value: 1 })

  const { client: client2 } = mockClient({
    numericAttributes: [{ key: "big", value: "0x7fffffffffffffff" }],
  })
  const removed = await resolvePatchEntities(client2, [
    { entityKey: ENTITY_KEY, attributes: [{ key: "big", value: null }] },
  ])
  expect(removed.attributes).not.toContainEqual({ key: "big", value: expect.anything() })
})

test("uses the provided expiresIn without fetching block timing", async () => {
  const { client, request } = mockClient()
  const update = await resolvePatchEntity(client, {
    entityKey: ENTITY_KEY,
    expiresIn: 1000,
  })

  expect(update.expiresIn).toEqual(1000)
  const methods = request.mock.calls.map(([{ method }]) => method)
  expect(methods).not.toContain("arkiv_getBlockTiming")
})

test("throws when expiresIn is omitted and the entity has already expired", async () => {
  const { client } = mockClient({ currentBlock: 100 })
  expect(
    resolvePatchEntity(client, {
      entityKey: ENTITY_KEY,
      payload: toBytes("new payload"),
    }),
  ).rejects.toThrowError(CannotPreserveExpirationError)
})

test("throws when expiresIn is omitted and the entity has no expiration block", async () => {
  const { client } = mockClient({ expiresAt: null })
  expect(
    resolvePatchEntity(client, {
      entityKey: ENTITY_KEY,
      payload: toBytes("new payload"),
    }),
  ).rejects.toThrowError(CannotPreserveExpirationError)
})

test("folds several patches for the same entity, later patches seeing earlier changes", async () => {
  const { client, request } = mockClient()
  const update = await resolvePatchEntities(client, [
    {
      entityKey: ENTITY_KEY,
      attributes: [
        { key: "a", value: 1 },
        { key: "replace", value: "first" },
      ],
    },
    {
      entityKey: ENTITY_KEY,
      payload: toBytes("second payload"),
      attributes: [{ key: "replace", value: "second" }],
    },
  ])

  // both patches applied, the second overriding the first where they overlap
  expect(update.payload).toEqual(toBytes("second payload"))
  expect(update.attributes).toEqual([
    { key: "keep", value: "kept" },
    { key: "num", value: 42 },
    { key: "a", value: 1 },
    { key: "replace", value: "second" },
  ])
  // the entity is only read once for the whole group
  const methods = request.mock.calls.map(([{ method }]) => method)
  expect(methods.filter((method) => method === "arkiv_query")).toHaveLength(1)
})

test("the last patch that sets expiresIn wins for a folded group", async () => {
  const { client, request } = mockClient()
  const update = await resolvePatchEntities(client, [
    { entityKey: ENTITY_KEY, expiresIn: 1000 },
    { entityKey: ENTITY_KEY, attributes: [{ key: "a", value: 1 }] },
  ])

  expect(update.expiresIn).toEqual(1000)
  const methods = request.mock.calls.map(([{ method }]) => method)
  expect(methods).not.toContain("arkiv_getBlockTiming")
})

test("uses the provided block timing instead of calling the client", async () => {
  const { client, request } = mockClient()
  const update = await resolvePatchEntities(
    client,
    [{ entityKey: ENTITY_KEY, payload: toBytes("new payload") }],
    { currentBlock: 40n, currentBlockTime: 2, blockDuration: 2 },
  )

  expect(update.expiresIn).toEqual(120)
  const methods = request.mock.calls.map(([{ method }]) => method)
  expect(methods).not.toContain("arkiv_getBlockTiming")
})

test("resolvePatches fetches block timing once for several patched entities", async () => {
  const { client, request } = mockClient()
  const otherKey = `0x${"22".repeat(32)}` as const
  const updates = await resolvePatches(client, [
    { entityKey: ENTITY_KEY, attributes: [{ key: "a", value: 1 }] },
    { entityKey: otherKey, attributes: [{ key: "b", value: 2 }] },
  ])

  expect(updates).toHaveLength(2)
  const methods = request.mock.calls.map(([{ method }]) => method)
  expect(methods.filter((method) => method === "arkiv_query")).toHaveLength(2)
  expect(methods.filter((method) => method === "arkiv_getBlockTiming")).toHaveLength(1)
})

test("resolvePatches skips block timing when every entity's patches set expiresIn", async () => {
  const { client, request } = mockClient()
  const updates = await resolvePatches(client, [
    { entityKey: ENTITY_KEY, attributes: [{ key: "a", value: 1 }] },
    { entityKey: ENTITY_KEY, expiresIn: 1000 },
  ])

  expect(updates).toHaveLength(1)
  expect(updates[0].expiresIn).toEqual(1000)
  const methods = request.mock.calls.map(([{ method }]) => method)
  expect(methods).not.toContain("arkiv_getBlockTiming")
})
