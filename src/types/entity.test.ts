import { describe, expect, test } from "bun:test"
import { Entity } from "./entity"

const KEY = "0xabc" as const

describe("Entity.toText()", () => {
  test("throws when payload is undefined", () => {
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [],
    )
    expect(() => entity.toText()).toThrow(
      "Entity has no payload – it was probably queried without withPayload(true) via QueryBuilder",
    )
  })

  test("returns string when payload is valid bytes", () => {
    const payload = new TextEncoder().encode("hello world")
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      payload,
      [],
    )
    expect(entity.toText()).toBe("hello world")
  })

  test("returns empty string when payload is empty", () => {
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Uint8Array([]),
      [],
    )
    expect(entity.toText()).toBe("")
  })
})

describe("Entity.toJson()", () => {
  test("throws when payload is undefined", () => {
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [],
    )
    expect(() => entity.toJson()).toThrow(
      "Entity has no payload – it was probably queried without withPayload(true) via QueryBuilder",
    )
  })

  test("throws when payload is empty", () => {
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Uint8Array([]),
      [],
    )
    expect(() => entity.toJson()).toThrow("Entity has empty payload, cannot parse as JSON")
  })

  test("throws when payload is invalid JSON", () => {
    const payload = new TextEncoder().encode("not valid json {")
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      payload,
      [],
    )
    expect(() => entity.toJson()).toThrow("Failed to parse entity payload as JSON")
  })

  test("preserves original error as cause when JSON parsing fails", () => {
    const payload = new TextEncoder().encode("not valid json {")
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      payload,
      [],
    )
    let caught: unknown
    try {
      entity.toJson()
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).cause).toBeInstanceOf(Error)
  })

  test("returns parsed object for valid JSON payload", () => {
    const data = { foo: "bar", count: 42 }
    const payload = new TextEncoder().encode(JSON.stringify(data))
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      payload,
      [],
    )
    expect(entity.toJson()).toEqual(data)
  })

  test("returns parsed array for valid JSON array payload", () => {
    const data = [1, 2, 3]
    const payload = new TextEncoder().encode(JSON.stringify(data))
    const entity = new Entity(
      KEY,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      payload,
      [],
    )
    expect(entity.toJson()).toEqual(data)
  })
})
