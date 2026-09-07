import { describe, expect, it } from "bun:test"
import { addr, bytes32, dec, i32, key, str, u256 } from "../attr"
import { InvalidAttributeNameError, InvalidValueError } from "../attr/errors"
import { and, eq, exists, gt, startsWith } from "./expression"
import { toRpcSelect } from "./selection"

const ACCOUNT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
const ENTITY_KEY = `0x${"ab".repeat(32)}` as const

/**
 * The query string is built by concatenation, so every value and name that reaches it is checked
 * here against the shapes that would change what the node parses rather than what it matches.
 */
describe("string literals cannot break out of their quotes", () => {
  it("doubles every quote, which is the language's only escape", () => {
    expect(String(eq("x", str("a' OR '1'='1")))).toBe("x = str('a'' OR ''1''=''1')")
    expect(String(eq("x", str("')")))).toBe("x = str(''')')")
    expect(String(eq("x", str("'")))).toBe("x = str('''')")
    expect(String(startsWith("x", "pre' OR '1"))).toBe("x STARTSWITH str('pre'' OR ''1')")
  })

  it("leaves a backslash literal — the language has no backslash escape to subvert", () => {
    // If `\` escaped anything, `\''` would close the string. It does not: `\` is an ordinary char,
    // and the quote after it is still doubled.
    expect(String(eq("x", str("a\\")))).toBe("x = str('a\\')")
    // Backslash, then a doubled quote, then the terminator — the backslash buys nothing.
    expect(String(eq("x", str("a\\'")))).toBe("x = str('a\\''')")
  })

  it("keeps a comment token harmless inside the quotes", () => {
    expect(String(eq("x", str("a -- comment")))).toBe("x = str('a -- comment')")
  })

  it("rejects control characters, which have no spelling inside a literal", () => {
    // The danger is a newline: `--` comments run to end of line, and a lexer that ends a string at
    // a newline would read the rest of the value as query text. There is no escape for one, so a
    // value carrying it could be stored but never queried — and might not fail loudly.
    for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
      const hostile = `a${String.fromCharCode(code)}AND flagged = true`
      expect(() => str(hostile)).toThrow(InvalidValueError)
      expect(() => str(hostile)).toThrow(/control character U\+/)
      // The bare-string path resolves through `str`, so it is closed too.
      expect(() => eq("x", hostile)).toThrow(InvalidValueError)
      expect(() => startsWith("x", hostile)).toThrow(InvalidValueError)
    }
  })

  it("names the offending character and where it is", () => {
    expect(() => str(`ab${String.fromCharCode(10)}c`)).toThrow(/U\+000A at index 2/)
  })

  it("still allows every printable character, including the awkward ones", () => {
    for (const value of ["a b", "a\\b", "a--b", "a)b(", "a=b", "élan", "日本語", 'a"b']) {
      expect(() => str(value)).not.toThrow()
    }
  })
})

describe("attribute names cannot smuggle a comment", () => {
  it("rejects a name containing the comment token", () => {
    // `-` is a legal name character, so `a--b` passes the grammar — and renders a query whose
    // entire remainder is commented out. Verified before the fix: `and(eq("approved", true),
    // eq("a--b", 1), eq("level", 5))` rendered `approved = true AND a--b = i32(1) AND level =
    // i32(5)`, in which the node sees only `approved = true AND a`.
    expect(() => eq("a--b", 1)).toThrow(InvalidAttributeNameError)
    expect(() => eq("a--b", 1)).toThrow(/opens a comment in the query language/)
    expect(() => exists("owner-name--x")).toThrow(InvalidAttributeNameError)
    // Rejected on the write path too, so nothing unqueryable can be stored in the first place.
    expect(() => str("fine")).not.toThrow()
  })

  it("keeps a single dash, which is unambiguous", () => {
    expect(String(eq("a-b", 1))).toBe("a-b = i32(1)")
    expect(String(eq("a-", 1))).toBe("a- = i32(1)")
  })

  it("rejects everything else outside the grammar", () => {
    for (const name of ["x' OR '1", "x)", "a b", "x'", "x(", "1x", "x;", "a".repeat(33)]) {
      expect(() => eq(name, 1)).toThrow(InvalidAttributeNameError)
    }
  })
})

describe("typed literals are closed by construction", () => {
  it("renders numerics as digits and nothing else", () => {
    expect(String(eq("x", i32(-2147483648)))).toBe("x = i32(-2147483648)")
    expect(String(eq("x", u256(2n ** 256n - 1n)))).toBe(
      "x = u256(115792089237316195423570985008687907853269984665640564039457584007913129639935)",
    )
    // Large and small decimals stay in positional notation — no exponent for a parser to choke on.
    expect(String(eq("x", dec("1000000000000000000000")))).toBe("x = dec(1000000000000000000000)")
    expect(String(eq("x", dec("-0.000000000000000001")))).toBe("x = dec(-0.000000000000000001)")
    expect(String(eq("x", u256(10n ** 30n)))).not.toMatch(/[eE+]/)
  })

  it("renders the byte-shaped types as fixed-width hex", () => {
    expect(String(eq("x", key(ENTITY_KEY)))).toMatch(/^x = key\(0x[0-9a-f]{64}\)$/)
    expect(String(eq("x", bytes32(ENTITY_KEY)))).toMatch(/^x = bytes32\(0x[0-9a-f]{64}\)$/)
    expect(String(eq("x", addr(ACCOUNT)))).toMatch(/^x = addr\(0x[0-9a-fA-F]{40}\)$/)
  })

  it("refuses hostile input at the constructor, before it can be rendered", () => {
    expect(() => u256("1) OR true --" as string)).toThrow(InvalidValueError)
    expect(() => addr("0x0') OR true --")).toThrow(InvalidValueError)
    expect(() => key("0xab') OR true --" as `0x${string}`)).toThrow(InvalidValueError)
    expect(() => dec("1) OR true")).toThrow(InvalidValueError)
    expect(() => i32("1) OR true" as unknown as number)).toThrow(InvalidValueError)
  })

  it("cannot be handed a hostile value through an untyped object either", () => {
    // toValue re-runs the constructor, so a look-alike carrying a string gets validated, not
    // interpolated.
    expect(() => eq("x", { type: "u256", value: "1) OR true --" } as unknown as string)).toThrow(
      InvalidValueError,
    )
  })
})

describe("the assembled query", () => {
  it("keeps every predicate intact through a hostile filter set", () => {
    const query = String(
      and(
        eq("approved", true),
        eq("note", str("a') OR true --")),
        gt("level", i32(5)),
        eq("$owner", addr(ACCOUNT)),
      ),
    )
    expect(query).toBe(
      "approved = true AND note = str('a'') OR true --') AND level > i32(5) AND " +
        `$owner = addr(${ACCOUNT})`,
    )
    // The guard predicates survive the hostile one, in both directions.
    expect(query).toContain("approved = true")
    expect(query).toContain("level > i32(5)")
  })
})

describe("the selection", () => {
  it("checks named attributes rather than forwarding them", () => {
    expect(() => toRpcSelect({ key: true, attributes: { "a' OR '1": true } })).toThrow(
      InvalidAttributeNameError,
    )
    expect(() => toRpcSelect({ key: true, attributes: { "a--b": true } })).toThrow(
      InvalidAttributeNameError,
    )
    expect(toRpcSelect({ key: true, attributes: { ok: true } })).toMatchObject({
      attributes: { ok: true },
    })
  })
})
