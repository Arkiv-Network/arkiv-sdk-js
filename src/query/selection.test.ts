import { describe, expect, it } from "bun:test"
import {
  addr,
  bytes,
  dec,
  defineSchema,
  InvalidAttributeNameError,
  i32,
  SchemaMismatchError,
  str,
  u256,
} from "../schema"
import { Entity } from "../types/entity"
import { projectSelection, toRow, toRpcSelect } from "./selection"

const EVERY_FIELD = {
  key: true,
  owner: true,
  creator: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  creationFlags: true,
  attributeSchema: true,
  attributes: true,
}

describe("toRpcSelect", () => {
  it("selects everything for no argument or a star", () => {
    expect(toRpcSelect()).toEqual(EVERY_FIELD)
    expect(toRpcSelect("*")).toEqual(EVERY_FIELD)
  })

  it("sends every field, so what was asked for is legible in the request", () => {
    // The node defaults everything but `key` to off. Spelling out the false ones costs nothing and
    // pins the answer even if those defaults move.
    expect(toRpcSelect({ owner: true })).toEqual({
      key: false,
      owner: true,
      creator: false,
      createdAt: false,
      updatedAt: false,
      expiresAt: false,
      creationFlags: false,
      attributeSchema: false,
      attributes: false,
    })
  })

  it("passes a named attribute subset through", () => {
    expect(
      toRpcSelect({ key: true, attributes: { projectId: true, version: true } }),
    ).toMatchObject({
      key: true,
      attributes: { projectId: true, version: true },
    })
  })

  it("drops names the subset turned off, and falls back to false when none are left", () => {
    expect(
      toRpcSelect({ key: true, attributes: { projectId: true, version: false } }),
    ).toMatchObject({ attributes: { projectId: true } })
    // An empty subset asks for no attributes, which is what `false` already means.
    expect(toRpcSelect({ key: true, attributes: {} })).toMatchObject({ attributes: false })
  })

  it("rejects a selection that asks for nothing", () => {
    expect(() => toRpcSelect({})).toThrow(/at least one field/)
    // The type system permits an explicit `false`; the node would answer it with empty rows.
    expect(() => toRpcSelect({ key: false })).toThrow(/at least one field/)
    expect(() => toRpcSelect({ key: false, attributes: {} })).toThrow(/at least one field/)
  })

  it("counts a named attribute subset as a selection in its own right", () => {
    expect(() => toRpcSelect({ attributes: { projectId: true } })).not.toThrow()
  })

  it("treats a field set to undefined as not selected", () => {
    expect(toRpcSelect({ key: true, owner: undefined })).toMatchObject({ key: true, owner: false })
    expect(() => toRpcSelect({ key: undefined })).toThrow(/at least one field/)
  })

  it("asks for any other name as an attribute, by name", () => {
    expect(toRpcSelect({ key: true, title: true })).toMatchObject({
      key: true,
      attributes: { title: true },
    })
    expect(toRpcSelect({ title: true, attributes: { body: true } })).toMatchObject({
      attributes: { title: true, body: true },
    })
    expect(() => toRpcSelect({ "not a name": true })).toThrow(InvalidAttributeNameError)
  })
})

const Posts = defineSchema({
  author: addr().indexed(),
  score: dec().indexed(),
  title: str(),
  body: bytes(),
  thumbnail: bytes().optional(),
})

const KEY = `0x${"ab".repeat(32)}` as const
const AUTHOR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

describe("projectSelection", () => {
  it("asks for the selected entity fields, and the selected columns by name", () => {
    const projection = projectSelection({ key: true, title: true, body: true, score: false }, Posts)
    expect(projection.select).toEqual({
      key: true,
      owner: false,
      creator: false,
      createdAt: false,
      updatedAt: false,
      expiresAt: false,
      creationFlags: false,
      attributeSchema: false,
      attributes: { title: true, body: true },
    })
    expect(projection.fields).toEqual(["key"])
    expect(projection.columns.map(([name]) => name)).toEqual(["title", "body"])
  })

  it("selects every entity field and every column for nothing or a star", () => {
    for (const selection of [undefined, "*"] as const) {
      const { select } = projectSelection(selection, Posts)
      expect(select).toMatchObject({ key: true, owner: true, creationFlags: true })
      // Named, not `true`: attributes beyond the schema stay on the node.
      expect(select.attributes).toEqual({
        author: true,
        score: true,
        title: true,
        body: true,
        thumbnail: true,
      })
    }
  })

  it("asks for no attributes when only entity fields are selected", () => {
    expect(projectSelection({ owner: true }, Posts).select.attributes).toBe(false)
  })

  it("rejects a name that is neither an entity field nor a column", () => {
    expect(() => projectSelection({ key: true, nope: true }, Posts)).toThrow(
      /"nope", which is neither an entity field nor a column/,
    )
  })

  it("reads attributes as a whole the same way through a schema as without one", () => {
    const projection = projectSelection({ key: true, title: true, attributes: true }, Posts)
    expect(projection.select.attributes).toBe(true)
    const entity = new Entity({ key: KEY, attributes: { title: str("Hi"), extra: i32(1) } })
    expect(toRow(entity, projection)).toEqual({
      key: KEY,
      title: str("Hi"),
      attributes: { title: str("Hi"), extra: i32(1) },
    })
  })

  it("rejects a selection that asks for nothing, or a map where a boolean belongs", () => {
    expect(() => projectSelection({ key: false }, Posts)).toThrow(/at least one field/)
    expect(() => projectSelection({ title: { x: true } }, Posts)).toThrow(/true or false/)
  })
})

describe("toRow", () => {
  const projection = projectSelection(
    { key: true, author: true, title: true, thumbnail: true },
    Posts,
  )

  it("lays out the selected fields and columns side by side", () => {
    const row = toRow(
      new Entity({
        key: KEY,
        owner: AUTHOR,
        attributes: {
          author: addr(AUTHOR),
          title: str("Hi"),
          thumbnail: bytes("0x01"),
          extra: i32(1),
        },
      }),
      projection,
    )
    expect(row).toEqual({
      key: KEY,
      author: addr(AUTHOR),
      title: str("Hi"),
      thumbnail: bytes("0x01"),
    })
  })

  it("gives an optional column the entity lacks as undefined", () => {
    const row = toRow(
      new Entity({ key: KEY, attributes: { author: addr(AUTHOR), title: str("Hi") } }),
      projection,
    )
    expect(row).toHaveProperty("thumbnail", undefined)
  })

  it("rejects an entity missing a required column, naming the entity", () => {
    const decode = () =>
      toRow(new Entity({ key: KEY, attributes: { author: addr(AUTHOR) } }), projection)
    expect(decode).toThrow(SchemaMismatchError)
    expect(decode).toThrow(new RegExp(`"title".*entity ${KEY} has no value`))
  })

  it("rejects an entity whose column holds another type than the schema declares", () => {
    const decode = () =>
      toRow(
        new Entity({ key: KEY, attributes: { author: addr(AUTHOR), title: i32(1) } }),
        projection,
      )
    expect(decode).toThrow(/holds a i32, not the str the schema declares/)
  })

  it("reads a column named after an Object.prototype key as absent when the entity lacks it", () => {
    const Odd = defineSchema({ constructor: str().optional(), toString: str().optional() })
    const row = toRow(new Entity({ key: KEY, attributes: {} }), projectSelection("*", Odd))
    expect(row).toHaveProperty("constructor", undefined)
    expect(row).toHaveProperty("toString", undefined)
  })
})

describe("a named schema", () => {
  const Tagged = defineSchema("posts", { title: str(), score: dec().optional() })
  const projection = projectSelection({ key: true, title: true }, Tagged)

  it("fetches the tag alongside the columns, even when no column is selected", () => {
    expect(projection.select.attributes).toEqual({ title: true, "arkiv.schema": true })
    expect(projectSelection({ key: true }, Tagged).select.attributes).toEqual({
      "arkiv.schema": true,
    })
  })

  it("checks the tag, but leaves it out of the row", () => {
    const row = toRow(
      new Entity({ key: KEY, attributes: { title: str("Hi"), "arkiv.schema": str("posts") } }),
      projection,
    )
    expect(row).toEqual({ key: KEY, title: str("Hi") })
  })

  it("rejects an entity tagged by another schema, or not tagged at all", () => {
    const other = () =>
      toRow(
        new Entity({ key: KEY, attributes: { title: str("Hi"), "arkiv.schema": str("comments") } }),
        projection,
      )
    expect(other).toThrow(SchemaMismatchError)
    expect(other).toThrow(/tagged "comments", not "posts"/)
    expect(() =>
      toRow(new Entity({ key: KEY, attributes: { title: str("Hi") } }), projection),
    ).toThrow(/not tagged with a schema/)
  })

  it("leaves the tag out of the attributes map and the attribute schema too", () => {
    const whole = projectSelection({ key: true, attributes: true, attributeSchema: true }, Tagged)
    const entity = new Entity({
      key: KEY,
      attributes: { title: str("Hi"), "arkiv.schema": str("posts") },
      attributeSchema: {
        title: { type: "str", indexed: false },
        "arkiv.schema": { type: "str", indexed: true },
      },
    })
    expect(toRow(entity, whole)).toEqual({
      key: KEY,
      attributes: { title: str("Hi") },
      attributeSchema: { title: { type: "str", indexed: false } },
    })
  })

  it("rejects an entity whose tag is not a str, whatever its type", () => {
    const decode = () =>
      toRow(
        new Entity({ key: KEY, attributes: { title: str("Hi"), "arkiv.schema": u256(5n) } }),
        projection,
      )
    expect(decode).toThrow(SchemaMismatchError)
    expect(decode).toThrow(/tagged with a value of type u256, not "posts"/)
  })
})
