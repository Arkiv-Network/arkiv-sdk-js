import { describe, expect, it } from "bun:test"
import { i32, str } from "../schema"
import { Entity } from "./entity"

const KEY = `0x${"ab".repeat(32)}` as const

describe("Entity", () => {
  it("carries only the fields it was built with", () => {
    const entity = new Entity({
      key: KEY,
      expiresAt: 1_297_000n,
      attributes: { level: i32(10), name: str("Bob") },
    })
    expect(entity.key).toBe(KEY)
    expect(entity.expiresAt).toBe(1_297_000n)
    expect(entity.attributes?.level.value).toBe(10)
    // Not selected is not the same as empty: nothing here stands in for data that was not asked for.
    expect(entity.owner).toBeUndefined()
    expect(entity.attributeSchema).toBeUndefined()
  })

  it("defaults to carrying nothing at all", () => {
    expect(new Entity().key).toBeUndefined()
  })
})
