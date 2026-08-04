import { describe, expect, it } from "bun:test"
import { i32, str } from "../attr"
import { Entity } from "./entity"

const KEY = `0x${"ab".repeat(32)}` as const

function withPayload(text: string): Entity {
  return new Entity({ key: KEY, payload: new TextEncoder().encode(text) })
}

describe("Entity", () => {
  it("carries only the fields it was built with", () => {
    const entity = new Entity({
      key: KEY,
      expiresAt: 1_297_000n,
      attributes: { level: i32(10), name: str("Bob") },
    })
    expect(entity.key).toBe(KEY)
    expect(entity.expiresAt).toBe(1_297_000n)
    expect(entity.attributes?.level?.value).toBe(10)
    // Not selected is not the same as empty: nothing here stands in for data that was not asked for.
    expect(entity.owner).toBeUndefined()
    expect(entity.payload).toBeUndefined()
    expect(entity.attributeSchema).toBeUndefined()
  })

  it("defaults to carrying nothing at all", () => {
    expect(new Entity().key).toBeUndefined()
  })
})

describe("toText", () => {
  it("decodes the payload as UTF-8", () => {
    expect(withPayload("hello world").toText()).toBe("hello world")
    expect(withPayload("").toText()).toBe("")
  })

  it("says how to ask for the payload when it was not selected", () => {
    expect(() => new Entity({ key: KEY }).toText()).toThrow(/select\(\{ payload: true \}\)/)
  })
})

describe("toJson", () => {
  it("parses objects and arrays", () => {
    expect(withPayload('{"a":1,"b":[2,3]}').toJson()).toEqual({ a: 1, b: [2, 3] })
    expect(withPayload("[1,2,3]").toJson()).toEqual([1, 2, 3])
  })

  it("throws on an empty payload rather than returning undefined", () => {
    expect(() => withPayload("").toJson()).toThrow(/empty payload/)
  })

  it("keeps the parse failure as the cause", () => {
    let caught: unknown
    try {
      withPayload("not json").toJson()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/Failed to parse entity payload as JSON/)
    expect((caught as Error).cause).toBeInstanceOf(Error)
  })

  it("reports the missing payload, not a JSON error", () => {
    expect(() => new Entity({ key: KEY }).toJson()).toThrow(/did not select it/)
  })
})
