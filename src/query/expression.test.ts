import { describe, expect, it } from "bun:test"
import { addr, bytes, dec, defineSchema, i32, key, str, u64, u256 } from "../schema"
import { InvalidAttributeNameError } from "../schema/errors"
import { InvalidPredicateError, UnsupportedOperatorError } from "./errors"
import {
  and,
  between,
  checkAgainstSchema,
  eq,
  exists,
  gt,
  gte,
  hasType,
  lt,
  lte,
  ne,
  not,
  or,
  render,
  startsWith,
} from "./expression"

const ENTITY_KEY = `0x${"ab".repeat(32)}` as const
const ACCOUNT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

describe("literals", () => {
  it("writes every type in its query spelling", () => {
    expect(String(eq("level", i32(10)))).toBe("level = i32(10)")
    expect(String(eq("level", i32(-42)))).toBe("level = i32(-42)")
    expect(String(eq("balance", u256(1_000_000n)))).toBe("balance = u256(1000000)")
    expect(String(eq("score", dec("3.5")))).toBe("score = dec(3.5)")
    expect(String(eq("name", str("Bob")))).toBe("name = str('Bob')")
    expect(String(eq("parent", key(ENTITY_KEY)))).toBe(`parent = key(${ENTITY_KEY})`)
    expect(String(eq("who", addr(ACCOUNT)))).toBe(`who = addr(${ACCOUNT})`)
  })

  it("writes bool bare — it is the one type with no wrapper", () => {
    expect(String(eq("flagged", true))).toBe("flagged = true")
    expect(String(eq("flagged", false))).toBe("flagged = false")
  })

  it("tags what the language would have inferred", () => {
    // An untagged number literal defaults to i32, so `level = 10` would parse the same. Writing it
    // out keeps the exact-type assertion — the thing that decides whether a u256 `level` matches —
    // visible in the query that actually went over the wire.
    expect(String(eq("level", 10))).toBe("level = i32(10)")
  })

  it("gives bare values the same types they take when written", () => {
    expect(String(eq("level", 10))).toBe("level = i32(10)")
    expect(String(eq("balance", 10n))).toBe("balance = u256(10)")
    expect(String(eq("name", "Bob"))).toBe("name = str('Bob')")
    expect(String(eq("flagged", true))).toBe("flagged = true")
  })

  it("escapes a quote by doubling it", () => {
    expect(String(eq("name", "O'Brien"))).toBe("name = str('O''Brien')")
    expect(String(eq("name", "''"))).toBe("name = str('''''')")
  })

  it("keeps the checksummed form of an address", () => {
    expect(String(eq("$owner", addr(ACCOUNT.toLowerCase())))).toBe(`$owner = addr(${ACCOUNT})`)
  })
})

describe("comparisons", () => {
  it("renders each operator", () => {
    expect(String(eq("a", 1))).toBe("a = i32(1)")
    expect(String(ne("a", 1))).toBe("a != i32(1)")
    expect(String(gt("a", 1))).toBe("a > i32(1)")
    expect(String(gte("a", 1))).toBe("a >= i32(1)")
    expect(String(lt("a", 1))).toBe("a < i32(1)")
    expect(String(lte("a", 1))).toBe("a <= i32(1)")
  })

  it("allows range operators on every indexable type", () => {
    expect(String(gt("level", i32(1)))).toBe("level > i32(1)")
    expect(String(gt("balance", u256(1n)))).toBe("balance > u256(1)")
    expect(String(gt("score", dec("1.5")))).toBe("score > dec(1.5)")
    // Ordered as the index orders them: false < true, and unsigned bytes for the rest.
    expect(String(gte("flagged", true))).toBe("flagged >= true")
    expect(String(lte("name", "Bob"))).toBe("name <= str('Bob')")
    expect(String(lt("who", addr(ACCOUNT)))).toBe(`who < addr(${ACCOUNT})`)
    expect(String(gt("parent", key(ENTITY_KEY)))).toBe(`parent > key(${ENTITY_KEY})`)
  })

  it("carries the offending operator and type on the error", () => {
    try {
      startsWith("level", i32(1) as never)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedOperatorError)
      const { attributeName, operator, tag } = error as UnsupportedOperatorError
      expect({ attributeName, operator, tag }).toEqual({
        attributeName: "level",
        operator: "STARTSWITH",
        tag: "i32",
      })
    }
  })

  it("validates the attribute name against the write-path grammar", () => {
    expect(() => eq("2fast", 1)).toThrow(InvalidAttributeNameError)
    expect(() => eq("has space", 1)).toThrow(InvalidAttributeNameError)
    // Reserved by the query language: `not = i32(1)` could never be parsed as a comparison.
    expect(() => eq("not", 1)).toThrow(InvalidAttributeNameError)
    expect(() => eq("str", 1)).toThrow(InvalidAttributeNameError)
    expect(() => eq("a".repeat(33), 1)).toThrow(InvalidAttributeNameError)
  })
})

describe("system attributes", () => {
  it("filters on the four that carry an index", () => {
    expect(String(eq("$key", key(ENTITY_KEY)))).toBe(`$key = key(${ENTITY_KEY})`)
    expect(String(eq("$owner", addr(ACCOUNT)))).toBe(`$owner = addr(${ACCOUNT})`)
    expect(String(ne("$creator", addr(ACCOUNT)))).toBe(`$creator != addr(${ACCOUNT})`)
    expect(String(lt("$expiresAt", u64(1_200_000n)))).toBe("$expiresAt < u64(1200000)")
  })

  it("holds each one to its fixed type", () => {
    // The trap this closes: a bare string is a `str`, so `eq("$owner", "0xabc…")` would otherwise
    // send `$owner = str('0xabc…')` and match nothing at all.
    expect(() => eq("$owner", ACCOUNT)).toThrow(InvalidPredicateError)
    expect(() => eq("$owner", ACCOUNT)).toThrow(/is a addr, but the value is a str/)
    expect(() => eq("$key", ENTITY_KEY)).toThrow(/write key\(\.\.\.\) around the value/)
    expect(() => eq("$expiresAt", 1_200_000)).toThrow(/is a u64, but the value is a i32/)
    expect(() => eq("$expiresAt", 1_200_000n)).toThrow(/write u64\(\.\.\.\) around the value/)
  })

  it("allows range comparisons on every one", () => {
    expect(String(gt("$owner", addr(ACCOUNT)))).toBe(`$owner > addr(${ACCOUNT})`)
    expect(String(lte("$key", key(ENTITY_KEY)))).toBe(`$key <= key(${ENTITY_KEY})`)
  })

  it("rejects the ones that are returned but not indexed", () => {
    for (const name of ["$createdAt", "$updatedAt", "$creationFlags"]) {
      expect(() => eq(name, 1)).toThrow(/carries no index, so it cannot be filtered on/)
      // A selection names the entity field, which has no `$`.
      expect(() => eq(name, 1)).toThrow(`Select it as \`${name.slice(1)}\``)
    }
  })

  it("rejects a $ name that is not a system attribute at all", () => {
    expect(() => eq("$nope", 1)).toThrow(/is not a system attribute/)
    expect(() => eq("$nope", 1)).toThrow(/\$key, \$owner, \$creator, \$expiresAt/)
  })

  it("rejects EXISTS and TYPEOF on them, which would be constants", () => {
    expect(() => exists("$owner")).toThrow(/set on every entity/)
    expect(() => hasType("$owner", "addr")).toThrow(/always a addr/)
  })

  it("rejects STARTSWITH — none of them is a str", () => {
    expect(() => startsWith("$owner", "0xd8")).toThrow(UnsupportedOperatorError)
  })
})

describe("between", () => {
  it("renders an inclusive range with both bounds tagged", () => {
    expect(String(between("score", dec("3.5"), dec("5")))).toBe("score BETWEEN dec(3.5) AND dec(5)")
    expect(String(between("level", 1, 5))).toBe("level BETWEEN i32(1) AND i32(5)")
    expect(String(between("name", "a", "m"))).toBe("name BETWEEN str('a') AND str('m')")
    expect(String(between("$expiresAt", u64(100n), u64(200n)))).toBe(
      "$expiresAt BETWEEN u64(100) AND u64(200)",
    )
  })

  it("is a leaf: its own AND needs no parentheses", () => {
    expect(String(and(between("a", 1, 5), eq("b", 2)))).toBe(
      "a BETWEEN i32(1) AND i32(5) AND b = i32(2)",
    )
    expect(String(or(between("a", 1, 5), eq("b", 2)))).toBe(
      "a BETWEEN i32(1) AND i32(5) OR b = i32(2)",
    )
    expect(String(not(between("a", 1, 5)))).toBe("NOT a BETWEEN i32(1) AND i32(5)")
  })

  it("rejects bounds of different types", () => {
    // @ts-expect-error - both bounds must have one type
    expect(() => between("score", 1, dec("5"))).toThrow(InvalidPredicateError)
    expect(() => between("score", 1, dec("5") as never)).toThrow(/a i32 and a dec bound/)
  })

  it("applies the checks every comparison does", () => {
    expect(() => between("$owner", ACCOUNT, ACCOUNT)).toThrow(/is a addr, but the value is a str/)
    expect(() => between("blob", bytes("0x01") as never, bytes("0x02") as never)).toThrow(
      /bytes are stored but never indexed/,
    )
    expect(() => between("not", 1, 2)).toThrow(InvalidAttributeNameError)
  })

  it("is checked against a schema like a comparison", () => {
    const Posts = defineSchema({ score: dec().indexed(), title: str() })
    expect(() => checkAgainstSchema(between("score", dec("1"), dec("2")), Posts)).not.toThrow()
    expect(() => checkAgainstSchema(between("score", 1, 2), Posts)).toThrow(/asserts a i32/)
    expect(() => checkAgainstSchema(between("title", "a", "b"), Posts)).toThrow(/not indexed/)
  })
})

describe("startsWith", () => {
  it("takes a bare string or a str value", () => {
    expect(String(startsWith("desc", "ab"))).toBe("desc STARTSWITH str('ab')")
    expect(String(startsWith("desc", str("ab")))).toBe("desc STARTSWITH str('ab')")
  })

  it("escapes the prefix like any other string literal", () => {
    expect(String(startsWith("desc", "O'"))).toBe("desc STARTSWITH str('O''')")
  })

  it("rejects a non-str value", () => {
    // @ts-expect-error - only a str has a prefix index
    expect(() => startsWith("level", i32(1))).toThrow(UnsupportedOperatorError)
  })
})

describe("exists and hasType", () => {
  it("renders the function-call forms", () => {
    expect(String(exists("reviewedBy"))).toBe("EXISTS(reviewedBy)")
    expect(String(hasType("age", "i32"))).toBe("TYPEOF(age) = i32")
  })

  it("rejects a type that cannot be set on an attribute", () => {
    // @ts-expect-error - bytes is never indexed, so TYPEOF can never see it
    expect(() => hasType("blob", "bytes")).toThrow(/is not an indexable attribute type/)
    // @ts-expect-error - not a type at all
    expect(() => hasType("age", "int")).toThrow(InvalidPredicateError)
  })

  it("does not mistake an inherited Object key for a type tag", () => {
    // `tag in TYPE_IDS` walks the prototype chain, so `hasType("a", "toString")` rendered
    // `TYPEOF(a) = toString` — a query the node can only answer with a parse error.
    for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      // @ts-expect-error - not a type tag
      expect(() => hasType("age", inherited)).toThrow(/is not an indexable attribute type/)
    }
  })

  it("validates the name", () => {
    expect(() => exists("2fast")).toThrow(InvalidAttributeNameError)
    expect(() => hasType("2fast", "i32")).toThrow(InvalidAttributeNameError)
  })
})

describe("combinators", () => {
  it("joins with the keyword operators", () => {
    expect(String(and(eq("a", 1), eq("b", 2)))).toBe("a = i32(1) AND b = i32(2)")
    expect(String(or(eq("a", 1), eq("b", 2)))).toBe("a = i32(1) OR b = i32(2)")
    expect(String(not(exists("closedAt")))).toBe("NOT EXISTS(closedAt)")
  })

  it("takes an array as well as separate arguments", () => {
    expect(String(and([eq("a", 1), eq("b", 2)]))).toBe("a = i32(1) AND b = i32(2)")
    expect(String(or([eq("a", 1), eq("b", 2)]))).toBe("a = i32(1) OR b = i32(2)")
  })

  it("returns a lone expression unwrapped", () => {
    const one = eq("a", 1)
    expect(and(one)).toBe(one)
    expect(or([one])).toBe(one)
  })

  it("refuses to combine nothing", () => {
    expect(() => and()).toThrow(InvalidPredicateError)
    expect(() => or([])).toThrow(/needs at least one expression/)
  })
})

describe("precedence", () => {
  it("parenthesises an OR inside an AND, and nothing else", () => {
    expect(String(and(eq("a", 1), or(eq("b", 2), eq("c", 3))))).toBe(
      "a = i32(1) AND (b = i32(2) OR c = i32(3))",
    )
    // AND binds tighter than OR, so the nesting the other way round needs no parentheses.
    expect(String(or(eq("a", 1), and(eq("b", 2), eq("c", 3))))).toBe(
      "a = i32(1) OR b = i32(2) AND c = i32(3)",
    )
  })

  it("flattens same-operator nesting rather than bracketing it", () => {
    expect(String(and(eq("a", 1), and(eq("b", 2), eq("c", 3))))).toBe(
      "a = i32(1) AND b = i32(2) AND c = i32(3)",
    )
  })

  it("parenthesises anything under NOT that is not a leaf", () => {
    expect(String(not(and(eq("a", 1), eq("b", 2))))).toBe("NOT (a = i32(1) AND b = i32(2))")
    expect(String(not(or(eq("a", 1), eq("b", 2))))).toBe("NOT (a = i32(1) OR b = i32(2))")
    // A comparison is a primary, so it needs none.
    expect(String(not(eq("a", 1)))).toBe("NOT a = i32(1)")
    expect(String(not(not(eq("a", 1))))).toBe("NOT NOT a = i32(1)")
  })

  it("renders the spec's worked example", () => {
    const q = and(
      gte("level", i32(10)),
      gte("score", dec("3.5")),
      lte("score", dec("5")),
      eq("parent", key(ENTITY_KEY)),
      eq("flagged", true),
      startsWith("desc", str("ab")),
      or(eq("status", str("open")), not(exists("closedAt"))),
      lt("$expiresAt", u64(1_200_000n)),
    )
    expect(q.toString()).toBe(
      "level >= i32(10) AND score >= dec(3.5) AND score <= dec(5) AND " +
        `parent = key(${ENTITY_KEY}) AND flagged = true AND desc STARTSWITH str('ab') AND ` +
        "(status = str('open') OR NOT EXISTS(closedAt)) AND $expiresAt < u64(1200000)",
    )
  })
})

describe("the expression tree", () => {
  it("is inspectable, frozen data", () => {
    const expression = eq("level", i32(10))
    expect(expression).toEqual({
      kind: "comparison",
      name: "level",
      operator: "=",
      value: i32(10),
    })
    expect(Object.isFrozen(expression)).toBe(true)
  })

  it("renders the same string through toString, String() and render()", () => {
    const expression = and(eq("a", 1), not(exists("b")))
    expect(expression.toString()).toBe(render(expression))
    expect(`${expression}`).toBe(render(expression))
  })
})

describe("bytes", () => {
  it("cannot be filtered on, bare or tagged — it is never indexed", () => {
    expect(() => eq("body", new Uint8Array([1]) as never)).toThrow(
      /bytes are stored but never indexed/,
    )
    expect(() => ne("body", bytes("0x01") as never)).toThrow(InvalidPredicateError)
  })
})

describe("checkAgainstSchema", () => {
  const Posts = defineSchema({
    author: addr().indexed(),
    category: str().indexed(),
    score: dec().indexed(),
    title: str(),
    body: bytes(),
  })

  it("accepts indexed columns compared against their own type, and system attributes", () => {
    expect(() =>
      checkAgainstSchema(
        and(
          eq("category", "docs"),
          not(gt("score", dec("4"))),
          or(exists("author"), startsWith("category", "d")),
          hasType("score", "dec"),
          eq("$owner", addr(ACCOUNT)),
        ),
        Posts,
      ),
    ).not.toThrow()
  })

  it("rejects an unindexed column, saying how to index it", () => {
    expect(() => checkAgainstSchema(eq("title", "x"), Posts)).toThrow(
      /"title" is not indexed.*str\(\)\.indexed\(\)/,
    )
    // Wherever it hides in the tree.
    expect(() =>
      checkAgainstSchema(and(eq("category", "docs"), not(exists("title"))), Posts),
    ).toThrow(InvalidPredicateError)
  })

  it("rejects a bytes column without suggesting it be indexed, which bytes never can be", () => {
    const check = () => checkAgainstSchema(exists("body"), Posts)
    expect(check).toThrow(InvalidPredicateError)
    expect(check).toThrow(/"body" is a bytes column, and bytes are stored but never indexed/)
    expect(check).toThrow(/Index a hash of it, as a hex str, instead/)
    expect(check).not.toThrow(/\.indexed\(\)/)
  })

  it("rejects a name that is not a column", () => {
    expect(() => checkAgainstSchema(eq("nope", 1), Posts)).toThrow(/"nope" is not a column/)
  })

  it("rejects a comparison against a value of another type, which could never match", () => {
    expect(() => checkAgainstSchema(eq("score", 5), Posts)).toThrow(
      /"score" is a dec column, but the predicate asserts a i32/,
    )
    expect(() => checkAgainstSchema(hasType("score", "i32"), Posts)).toThrow(InvalidPredicateError)
  })
})
