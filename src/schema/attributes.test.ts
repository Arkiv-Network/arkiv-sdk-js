import { describe, expect, it } from "bun:test"
import { hexToString } from "viem"
import { encodeCreate, encodePatch, MAX_ENTITY_BYTES } from "./attributes"
import {
  ConflictingMutationError,
  EntityTooLargeError,
  InvalidAttributeNameError,
  InvalidValueError,
  MissingValueError,
  SchemaDefinitionError,
  SchemaMismatchError,
} from "./errors"
import { isValidAttributeName, validateAttributeName } from "./names"
import { defineSchema, type Schema } from "./schema"
import { INDEXED_FLAG, TYPE_IDS } from "./types"
import { bytes, dec, i32, str, u64 } from "./values"

const Posts = defineSchema({
  category: str().indexed(),
  score: dec().indexed().optional(),
  title: str(),
  body: bytes(),
  thumbnail: bytes().optional(),
  mimeType: str().default("text/markdown"),
})

/** The encoded attributes keyed by their decoded name, for asserting on one at a time. */
function byName(attributes: ReturnType<typeof encodeCreate>) {
  return Object.fromEntries(
    attributes.map((attribute) => [hexToString(attribute.name, { size: 32 }), attribute]),
  )
}

describe("encodeCreate", () => {
  const values = { category: "docs", title: "Hello", body: new Uint8Array([1, 2]) }

  it("flags indexed columns in bit 7 of the typeId, and leaves the rest unflagged", () => {
    const encoded = byName(encodeCreate(Posts, { ...values, score: dec("4.1") }))
    expect(encoded.category?.typeId).toBe(TYPE_IDS.str | INDEXED_FLAG)
    expect(encoded.score?.typeId).toBe(TYPE_IDS.dec | INDEXED_FLAG)
    expect(encoded.title?.typeId).toBe(TYPE_IDS.str)
    expect(encoded.body?.typeId).toBe(TYPE_IDS.bytes)
  })

  it("writes a defaulted column left out with its default", () => {
    const encoded = byName(encodeCreate(Posts, values))
    expect(hexToString(encoded.mimeType?.value ?? "0x")).toBe("text/markdown")
  })

  it("prefers a given value over the default", () => {
    const encoded = byName(encodeCreate(Posts, { ...values, mimeType: "text/plain" }))
    expect(hexToString(encoded.mimeType?.value ?? "0x")).toBe("text/plain")
  })

  it("leaves out an optional column that is not given, or given as undefined", () => {
    expect(byName(encodeCreate(Posts, values)).thumbnail).toBeUndefined()
    expect(
      byName(encodeCreate(Posts, { ...values, thumbnail: undefined })).thumbnail,
    ).toBeUndefined()
  })

  it("carries any number of bytes columns", () => {
    const encoded = byName(encodeCreate(Posts, { ...values, thumbnail: bytes("0xffd8") }))
    expect(encoded.body?.value).toBe("0x0102")
    expect(encoded.thumbnail?.value).toBe("0xffd8")
  })

  it("sorts strictly ascending by the encoded name, whatever order the schema declares", () => {
    const names = encodeCreate(Posts, values).map((attribute) => attribute.name)
    expect(names).toEqual([...names].sort())
  })

  it("rejects a required column left out, naming it", () => {
    const { title: _, ...withoutTitle } = values
    expect(() => encodeCreate(Posts, withoutTitle)).toThrow(SchemaMismatchError)
    expect(() => encodeCreate(Posts, withoutTitle)).toThrow(/"title".*required str column/)
  })

  it("rejects a column the schema does not have", () => {
    expect(() => encodeCreate(Posts, { ...values, extra: 1 })).toThrow(/"extra".*does not have/)
  })

  it("rejects a value of another type than its column, bare or tagged", () => {
    // A bare string is a str, never a dec — the schema does not reinterpret it.
    expect(() => encodeCreate(Posts, { ...values, score: "4.1" })).toThrow(
      /"score": a dec column, but the value is a str/,
    )
    expect(() => encodeCreate(Posts, { ...values, title: i32(1) })).toThrow(SchemaMismatchError)
  })

  it("rejects null rather than treating it as absent", () => {
    expect(() => encodeCreate(Posts, { ...values, thumbnail: null })).toThrow(MissingValueError)
  })

  it("rejects a column where a value belongs", () => {
    expect(() => encodeCreate(Posts, { ...values, title: str() })).toThrow(/a column, not a value/)
  })

  it("rejects something that is not a schema", () => {
    expect(() => encodeCreate({ columns: {} } as unknown as Schema, {})).toThrow(
      SchemaDefinitionError,
    )
  })

  it("accepts an empty schema, which writes no attributes", () => {
    expect(encodeCreate(defineSchema({}), {})).toEqual([])
  })
})

describe("a named schema's tag", () => {
  const Tagged = defineSchema("posts", { title: str() })

  it("is written on every create, as an indexed str", () => {
    const encoded = byName(encodeCreate(Tagged, { title: "Hi" }))
    expect(encoded["arkiv.schema"]?.typeId).toBe(TYPE_IDS.str | INDEXED_FLAG)
    expect(hexToString(encoded["arkiv.schema"]?.value ?? "0x")).toBe("posts")
  })

  it("is not written by an unnamed schema", () => {
    expect(
      byName(encodeCreate(Posts, { category: "c", title: "t", body: new Uint8Array() }))[
        "arkiv.schema"
      ],
    ).toBeUndefined()
  })

  it("is not touched by a patch, which changes only what it names", () => {
    expect(byName(encodePatch(Tagged, { set: { title: "Hi" } }))["arkiv.schema"]).toBeUndefined()
  })

  it("cannot be written or unset as a column", () => {
    expect(() => encodeCreate(Tagged, { title: "Hi", "arkiv.schema": "other" })).toThrow(
      SchemaMismatchError,
    )
    expect(() => encodePatch(Tagged, { unset: ["arkiv.schema"] as never })).toThrow(
      SchemaMismatchError,
    )
  })
})

describe("encodePatch", () => {
  it("writes only what it names, with each column's indexed flag", () => {
    const encoded = byName(encodePatch(Posts, { set: { category: "news", title: "Hi" } }))
    expect(Object.keys(encoded).sort()).toEqual(["category", "title"])
    expect(encoded.category?.typeId).toBe(TYPE_IDS.str | INDEXED_FLAG)
    expect(encoded.title?.typeId).toBe(TYPE_IDS.str)
  })

  it("does not apply defaults — a patch changes only what it names", () => {
    expect(byName(encodePatch(Posts, { set: { title: "Hi" } })).mimeType).toBeUndefined()
  })

  it("tombstones an optional column", () => {
    const [tombstone] = encodePatch(Posts, { unset: ["thumbnail"] })
    expect(tombstone).toMatchObject({ typeId: 0, value: "0x" })
  })

  it("refuses to unset a required column", () => {
    expect(() => encodePatch(Posts, { unset: ["title"] as never })).toThrow(
      /"title": a required column/,
    )
  })

  it("refuses to unset or set a column the schema does not have", () => {
    expect(() => encodePatch(Posts, { unset: ["nope"] as never })).toThrow(SchemaMismatchError)
    expect(() => encodePatch(Posts, { set: { nope: 1 } })).toThrow(SchemaMismatchError)
  })

  it("rejects a name that is both set and unset", () => {
    expect(() =>
      encodePatch(Posts, { set: { thumbnail: new Uint8Array() }, unset: ["thumbnail"] }),
    ).toThrow(ConflictingMutationError)
  })

  it("rejects a set value of the wrong type", () => {
    expect(() => encodePatch(Posts, { set: { score: 4 } })).toThrow(SchemaMismatchError)
  })

  it("sorts writes and tombstones together", () => {
    const names = encodePatch(Posts, { set: { title: "t", category: "c" }, unset: ["score"] }).map(
      (attribute) => attribute.name,
    )
    expect(names).toEqual([...names].sort())
  })

  it("rejects an unset that is not an array", () => {
    expect(() => encodePatch(Posts, { unset: "thumbnail" as never })).toThrow(TypeError)
  })
})

describe("bytes", () => {
  it("is never an indexed column's type", () => {
    expect(() =>
      encodeCreate(defineSchema({ n: u64().indexed() }), { n: bytes("0x01") as never }),
    ).toThrow(/a u64 column, but the value is a bytes/)
  })

  it("rejects a value over the 128 KiB cap", () => {
    expect(() =>
      encodeCreate(Posts, {
        category: "c",
        title: "t",
        body: new Uint8Array(128 * 1024 + 1),
      }),
    ).toThrow(InvalidValueError)
  })
})

describe("the total bytes cap", () => {
  const half = new Uint8Array(MAX_ENTITY_BYTES / 2)
  const base = { category: "docs", title: "Hello" }

  it("accepts bytes columns that add up to the cap", () => {
    expect(() => encodeCreate(Posts, { ...base, body: half, thumbnail: half })).not.toThrow()
  })

  it("rejects a create whose bytes columns add up to more", () => {
    const over = new Uint8Array(MAX_ENTITY_BYTES / 2 + 1)
    expect(() => encodeCreate(Posts, { ...base, body: half, thumbnail: over })).toThrow(
      EntityTooLargeError,
    )
  })

  it("applies to a patch's writes too", () => {
    const over = new Uint8Array(MAX_ENTITY_BYTES / 2 + 1)
    expect(() => encodePatch(Posts, { set: { body: half, thumbnail: over } })).toThrow(
      /at most 131072 bytes in total, got 131073/,
    )
  })
})

describe("validateAttributeName", () => {
  it("accepts the Ident32 grammar, in either case", () => {
    for (const name of ["a", "tag", "Tag", "projectId", "num_attr", "a.b-c_D9", "a".repeat(32)]) {
      expect(isValidAttributeName(name)).toBe(true)
    }
  })

  it("treats names as case-sensitive, so two casings are two attributes", () => {
    const schema = defineSchema({ level: i32(), Level: i32() })
    expect(encodeCreate(schema, { level: 1, Level: 2 })).toHaveLength(2)
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
    for (const reserved of [
      "and",
      "OR",
      "Between",
      "key",
      "str",
      "bytes",
      "EXISTS",
      "order",
      "BY",
      "Asc",
      "desc",
    ]) {
      expect(() => validateAttributeName(reserved)).toThrow(/reserved by the query language/)
    }
    // Only the exact word is reserved — a name containing it is fine.
    expect(isValidAttributeName("android")).toBe(true)
    expect(isValidAttributeName("sortKey")).toBe(true)
    expect(isValidAttributeName("orderedAt")).toBe(true)
    expect(isValidAttributeName("description")).toBe(true)
    // No longer a type, so no longer reserved.
    expect(isValidAttributeName("bytes32")).toBe(true)
  })
})
