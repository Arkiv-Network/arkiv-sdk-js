import { describe, expect, it } from "bun:test"
import { bytes, dec, defineSchema, InvalidAttributeNameError, str, u256 } from "../schema"
import { InvalidPredicateError } from "./errors"
import { asc, desc, isOrderTerm, type OrderTerm, renderOrderBy } from "./order"

const Posts = defineSchema("posts", {
  score: dec().indexed(),
  title: str(),
  rank: u256().indexed().optional(),
  body: bytes(),
})

describe("asc and desc", () => {
  it("build a frozen key with the direction and the type written", () => {
    const key = desc("score", "u256")
    expect(key).toEqual({ kind: "order", name: "score", type: "u256", direction: "desc" })
    expect(Object.isFrozen(key)).toBe(true)
    expect(asc("title").direction).toBe("asc")
  })

  it("leave a user attribute's type for the schema to supply", () => {
    expect(asc("score").type).toBeUndefined()
  })

  it("give a system attribute its fixed type", () => {
    expect(asc("$expiresAt").type).toBe("u64")
    expect(desc("$owner").type).toBe("addr")
    expect(asc("$key", "key").type).toBe("key")
  })

  it("reject a system attribute that cannot be sorted on", () => {
    expect(() => desc("$createdAt")).toThrow(/cannot be sorted on.*sort the results/)
    expect(() => asc("$nope")).toThrow(InvalidPredicateError)
  })

  it("reject a system attribute given another type", () => {
    expect(() => asc("$expiresAt", "u256")).toThrow(/always a u64/)
  })

  it("reject a type that is not indexable", () => {
    // @ts-expect-error - bytes cannot be sorted on
    expect(() => asc("blob", "bytes")).toThrow(/"blob" cannot be sorted as "bytes"/)
  })

  it("reject a name outside the attribute grammar", () => {
    expect(() => asc("not a name", "str")).toThrow(InvalidAttributeNameError)
  })

  it("build keys isOrderTerm recognises", () => {
    expect(isOrderTerm(asc("score"))).toBe(true)
    expect(isOrderTerm([asc("score")])).toBe(false)
    expect(isOrderTerm("score")).toBe(false)
    expect(isOrderTerm(undefined)).toBe(false)
  })
})

describe("renderOrderBy", () => {
  it("writes the key as name:type and its direction", () => {
    expect(renderOrderBy(desc("score", "u256"), undefined)).toBe("ORDER BY score:u256 DESC")
    expect(renderOrderBy(asc("title", "str"), undefined)).toBe("ORDER BY title:str ASC")
  })

  it("takes the key's type from the schema's column", () => {
    expect(renderOrderBy(desc("score"), Posts)).toBe("ORDER BY score:dec DESC")
    expect(renderOrderBy(asc("rank"), Posts)).toBe("ORDER BY rank:u256 ASC")
    expect(renderOrderBy(asc("$expiresAt"), Posts)).toBe("ORDER BY $expiresAt:u64 ASC")
  })

  it("needs a type for a user attribute without a schema", () => {
    expect(() => renderOrderBy(desc("score"), undefined)).toThrow(/needs its type/)
  })

  it("sorts on a column whether or not it is indexed", () => {
    expect(renderOrderBy(asc("title"), Posts)).toBe("ORDER BY title:str ASC")
    expect(renderOrderBy(desc("title", "str"), Posts)).toBe("ORDER BY title:str DESC")
  })

  it("checks a key against the schema", () => {
    expect(() => renderOrderBy(asc("nope"), Posts)).toThrow(/not a column of the schema/)
    expect(() => renderOrderBy(asc("body"), Posts)).toThrow(/bytes cannot be sorted on/)
    expect(() => renderOrderBy(asc("title", "u256"), Posts)).toThrow(/str column/)
    expect(() => renderOrderBy(asc("score", "u256"), Posts)).toThrow(/dec column/)
  })

  it("words the schema errors for a sort, not a filter", () => {
    expect(() => renderOrderBy(asc("nope"), Posts)).toThrow(/so it cannot be sorted on/)
    expect(() => renderOrderBy(asc("body"), Posts)).not.toThrow(/hash/)
    expect(() => renderOrderBy(asc("body"), Posts)).toThrow(/sort the results in JavaScript/)
  })

  it("says a typeless system key was not built by asc() or desc(), schema or not", () => {
    const handBuilt = { kind: "order", name: "$key", type: undefined, direction: "asc" } as const
    for (const schema of [Posts, undefined]) {
      expect(() => renderOrderBy(handBuilt as OrderTerm, schema)).toThrow(
        /system attribute's is fixed\. Build it with asc\(\) or desc\(\)/,
      )
    }
  })
})
