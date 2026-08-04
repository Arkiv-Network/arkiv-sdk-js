import { describe, expect, it } from "bun:test"
import { encodeAttributes, MAX_ATTRIBUTES, resolveAttributes } from "./attributes"
import { InvalidAttributeNameError, TooManyAttributesError } from "./errors"
import { isValidAttributeName, validateAttributeName } from "./names"
import { dec, i32, str, u256 } from "./values"

describe("resolveAttributes", () => {
  it("types bare values and leaves tagged ones alone", () => {
    const resolved = resolveAttributes({
      level: 10,
      balance: 1_000_000n,
      name: "Bob",
      flagged: true,
      score: dec("3.5"),
    })
    expect(resolved.level).toEqual(i32(10))
    expect(resolved.balance).toEqual(u256(1_000_000n))
    expect(resolved.name).toEqual(str("Bob"))
    expect(resolved.flagged.type).toBe("bool")
    expect(resolved.score).toEqual(dec("3.5"))
  })

  it("reports the attribute count when there are too many", () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_ATTRIBUTES + 1 }, (_, i) => [`a${i}`, i]),
    )
    expect(() => resolveAttributes(tooMany)).toThrow(TooManyAttributesError)
    expect(() => resolveAttributes(tooMany)).toThrow(/at most 32 attributes, got 33/)
  })
})

describe("encodeAttributes", () => {
  it("sorts strictly ascending by the encoded name, whatever order they were written in", () => {
    const encoded = encodeAttributes({ zebra: 1, apple: 2, mango: 3 })
    const names = encoded.map((attribute) => attribute.name)
    expect(names).toEqual([...names].sort())
    expect(encoded).toHaveLength(3)
  })

  it("carries each value's typeId", () => {
    const ids = encodeAttributes({ level: i32(1), score: dec("1"), tag: "x" }).map((a) => a.typeId)
    expect([...ids].sort()).toEqual([2, 4, 7])
  })

  it("accepts an empty attribute set", () => {
    expect(encodeAttributes({})).toEqual([])
  })
})

describe("validateAttributeName", () => {
  it("accepts the Ident32 grammar, in either case", () => {
    for (const name of ["a", "tag", "Tag", "projectId", "num_attr", "a.b-c_D9", "a".repeat(32)]) {
      expect(isValidAttributeName(name)).toBe(true)
    }
  })

  it("treats names as case-sensitive, so two casings are two attributes", () => {
    const resolved = resolveAttributes({ level: 1, Level: 2 })
    expect(resolved.level).toEqual(i32(1))
    expect(resolved.Level).toEqual(i32(2))
    expect(encodeAttributes({ level: 1, Level: 2 })).toHaveLength(2)
  })

  it("rejects names outside the grammar, pointing at the offending character", () => {
    expect(() => validateAttributeName("")).toThrow(InvalidAttributeNameError)
    expect(() => validateAttributeName("1tag")).toThrow(/starts with "1"/)
    expect(() => validateAttributeName("_tag")).toThrow(/starts with "_"/)
    expect(() => validateAttributeName("has space")).toThrow(/" " at position 3/)
    expect(() => validateAttributeName("héllo")).toThrow(/"é" at position 1/)
    expect(() => validateAttributeName("a:b")).toThrow(/":" at position 1/)
    expect(() => validateAttributeName("a".repeat(33))).toThrow(/33 bytes long/)
  })

  it("reserves $ for the system attributes the engine sets", () => {
    expect(() => validateAttributeName("$owner")).toThrow(/reserved for system attributes/)
  })

  it("rejects names the query language could never parse back, whatever their casing", () => {
    for (const reserved of ["and", "OR", "Not", "key", "str", "u256", "EXISTS", "Bytes32"]) {
      expect(() => validateAttributeName(reserved)).toThrow(/reserved by the query language/)
    }
    // Only the exact word is reserved — a name containing it is fine.
    expect(isValidAttributeName("android")).toBe(true)
    expect(isValidAttributeName("sortKey")).toBe(true)
  })
})
