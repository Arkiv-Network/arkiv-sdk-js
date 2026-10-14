import { describe, expect, it } from "bun:test"
import { isColumn } from "./column"
import {
  InvalidAttributeNameError,
  InvalidValueError,
  SchemaDefinitionError,
  TooManyAttributesError,
} from "./errors"
import { defineSchema, isSchema, MAX_ATTRIBUTES, SCHEMA_ATTRIBUTE, SYSTEM_FIELDS } from "./schema"
import { addr, bytes, dec, i32, str, u64 } from "./values"

describe("columns", () => {
  it("start unindexed, required and without a default", () => {
    expect(str()).toMatchObject({
      type: "str",
      isIndexed: false,
      isOptional: false,
      defaultValue: undefined,
    })
  })

  it("refine by returning a new column, leaving the original alone", () => {
    const base = dec()
    const refined = base.indexed().optional()
    expect(refined).toMatchObject({ type: "dec", isIndexed: true, isOptional: true })
    expect(base).toMatchObject({ isIndexed: false, isOptional: false })
    expect(Object.isFrozen(refined)).toBe(true)
  })

  it("keep every refinement, whatever order they are chained in", () => {
    const a = i32().default(3).indexed().optional()
    const b = i32().optional().indexed().default(3)
    for (const column of [a, b]) {
      expect(column).toMatchObject({ isIndexed: true, isOptional: true, defaultValue: i32(3) })
    }
  })

  it("take a default as the constructor's argument, or as a value of the column's type", () => {
    expect(dec().default("4.1").defaultValue).toEqual(dec("4.1"))
    expect(dec().default(dec("4.1")).defaultValue).toEqual(dec("4.1"))
    expect(u64().default(5).defaultValue).toEqual(u64(5n))
    expect(bytes().default(new Uint8Array([1])).defaultValue?.value).toBe("0x01")
  })

  it("validate a default when it is declared, not when it is first written", () => {
    expect(() => dec().default("4.1.1")).toThrow(InvalidValueError)
    expect(() => u64().default(-1)).toThrow(/negative/)
    // A value of another type is not silently converted.
    expect(() => dec().default(i32(4) as never)).toThrow(/i32 value, not a dec/)
  })

  it("reject a default that is missing or undefined", () => {
    expect(() => (str() as unknown as { default(): unknown }).default()).toThrow(
      SchemaDefinitionError,
    )
    expect(() => str().default(undefined as unknown as string)).toThrow(InvalidValueError)
  })

  it("never index bytes, even past the type system", () => {
    const column = bytes() as unknown as { indexed(): unknown }
    expect(() => column.indexed()).toThrow(/bytes column cannot be indexed/)
  })
})

describe("defineSchema", () => {
  it("keeps the columns, in the order they were declared", () => {
    const Posts = defineSchema({ title: str(), score: dec().indexed(), body: bytes() })
    expect(isSchema(Posts)).toBe(true)
    expect(Object.keys(Posts.columns)).toEqual(["title", "score", "body"])
    expect(isColumn(Posts.columns.score)).toBe(true)
    expect(Object.isFrozen(Posts.columns)).toBe(true)
  })

  it("rejects a value where a column belongs, suggesting the default it may have meant", () => {
    const define = () => defineSchema({ score: dec("4.1") } as never)
    expect(define).toThrow(SchemaDefinitionError)
    expect(define).toThrow(/did you mean dec\(\)\.default\("4\.1"\)/i)
    expect(() => defineSchema({ n: u64(5n) } as never)).toThrow(/u64\(\)\.default\(5n\)/)
  })

  it("rejects anything else that is not a column", () => {
    expect(() => defineSchema({ title: "str" } as never)).toThrow(/not a column/)
    expect(() => defineSchema({ title: str } as never)).toThrow(/not a column/)
    expect(() => defineSchema([] as never)).toThrow(SchemaDefinitionError)
  })

  it("holds column names to the attribute-name grammar", () => {
    expect(() => defineSchema({ "1st": str() })).toThrow(InvalidAttributeNameError)
    expect(() => defineSchema({ $owner: addr() })).toThrow(/reserved for system attributes/)
  })

  it("reserves the names a row already uses for entity fields and selection keys", () => {
    for (const name of [...SYSTEM_FIELDS.filter((field) => field !== "key"), "attributes"]) {
      expect(() => defineSchema({ [name]: str() })).toThrow(/a column cannot use it/)
    }
  })

  it("caps the number of columns at what one operation can carry", () => {
    const columns = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`c${i}`, i32()]))
    expect(() => defineSchema(columns(MAX_ATTRIBUTES))).not.toThrow()
    expect(() => defineSchema(columns(MAX_ATTRIBUTES + 1))).toThrow(TooManyAttributesError)
  })

  it("accepts a schema with no columns", () => {
    expect(defineSchema({}).columns).toEqual({})
  })
})

describe("named schemas", () => {
  it("carry their name, and the str tag their entities are marked with", () => {
    const Posts = defineSchema("posts", { title: str() })
    expect(Posts.name).toBe("posts")
    expect(Posts.tag).toEqual(str("posts"))
    expect(Object.keys(Posts.columns)).toEqual(["title"])
  })

  it("leave an unnamed schema untagged", () => {
    const Posts = defineSchema({ title: str() })
    expect(Posts.name).toBeUndefined()
    expect(Posts.tag).toBeUndefined()
  })

  it("reject a name that is not a valid str", () => {
    expect(() => defineSchema("", { title: str() })).toThrow(/non-empty string/)
    expect(() => defineSchema("a\nb", { title: str() })).toThrow(SchemaDefinitionError)
    expect(() => defineSchema("x".repeat(129), { title: str() })).toThrow(/not a valid str tag/)
  })

  it("reserve the tag's attribute name, named or not", () => {
    expect(() => defineSchema({ [SCHEMA_ATTRIBUTE]: str() })).toThrow(
      /the attribute a named schema tags its entities with/,
    )
    expect(() => defineSchema("posts", { [SCHEMA_ATTRIBUTE]: str() })).toThrow(
      SchemaDefinitionError,
    )
  })

  it("count the tag against the attribute cap", () => {
    const columns = Object.fromEntries(
      Array.from({ length: MAX_ATTRIBUTES }, (_, i) => [`c${i}`, i32()]),
    )
    expect(() => defineSchema(columns)).not.toThrow()
    expect(() => defineSchema("full", columns)).toThrow(/at most 32 attributes, got 33/)
  })
})

describe("recognising schemas and columns", () => {
  it("goes by a registry brand, so another copy of the SDK recognises them too", () => {
    // What a schema built by a second copy of this module — the CJS build next to the ESM one —
    // looks like from here: same shape, same registry symbol, a different class.
    const foreign = Object.freeze(
      Object.defineProperty(
        { name: undefined, tag: undefined, columns: {} },
        Symbol.for("@arkiv-network/sdk/schema"),
        { value: true },
      ),
    )
    expect(isSchema(foreign)).toBe(true)
    expect(isSchema(defineSchema({ title: str() }))).toBe(true)
    expect(
      isColumn(Object.defineProperty({}, Symbol.for("@arkiv-network/sdk/column"), { value: true })),
    ).toBe(true)
  })

  it("does not take a look-alike without the brand", () => {
    expect(isSchema({ columns: {} })).toBe(false)
    expect(isColumn({ type: "str", isIndexed: false, isOptional: false })).toBe(false)
  })
})
