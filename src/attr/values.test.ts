import { describe, expect, it } from "bun:test"
import { InvalidValueError, MissingValueError, UntypedValueError } from "./errors"
import { TYPE_IDS } from "./types"
import {
  addr,
  bool,
  bytes32,
  dec,
  decFromUnits,
  decUnits,
  I32_MAX,
  I32_MIN,
  i32,
  key,
  str,
  toValue,
  U256_MAX,
  u256,
} from "./values"

const KEY = `0x${"ab".repeat(32)}` as const
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

describe("tagged constructors", () => {
  it("tag each value with the type it was built as", () => {
    const built = [
      [bool(true), "bool", true],
      [i32(10), "i32", 10],
      [u256(10n), "u256", 10n],
      [dec("3.5"), "dec", "3.5"],
      [str("Bob"), "str", "Bob"],
      [key(KEY), "key", KEY],
      [bytes32(KEY), "bytes32", KEY],
      [addr(VITALIK), "addr", VITALIK],
    ] as const
    for (const [value, tag, decoded] of built) {
      expect(value.type).toBe(tag)
      expect(value.value).toBe(decoded)
    }
  })

  it("keep the tag distinct from the wire typeId", () => {
    // The tag is what a client says; the typeId is what the wire carries.
    expect(TYPE_IDS[i32(1).type]).toBe(2)
    expect(TYPE_IDS[key(KEY).type]).toBe(9)
    expect(TYPE_IDS[bytes32(KEY).type]).toBe(5)
  })
})

describe("i32", () => {
  it("accepts the full signed 32-bit range", () => {
    expect(i32(I32_MIN).value).toBe(I32_MIN)
    expect(i32(I32_MAX).value).toBe(I32_MAX)
    expect(i32(-42).value).toBe(-42)
    expect(i32(0n).value).toBe(0)
  })

  it("rejects values outside the range, naming the type that fits", () => {
    expect(() => i32(I32_MAX + 1)).toThrow(InvalidValueError)
    expect(() => i32(Date.now())).toThrow(/use u256/)
    expect(() => i32(I32_MIN - 1)).toThrow(/use dec/)
    expect(() => i32(2n ** 40n)).toThrow(InvalidValueError)
  })

  it("rejects non-integers, quoting the dec call that would work", () => {
    expect(() => i32(3.5)).toThrow(/dec\("3\.5"\)/)
    expect(() => i32(Number.NaN)).toThrow(InvalidValueError)
    expect(() => i32(Number.POSITIVE_INFINITY)).toThrow(InvalidValueError)
  })
})

describe("u256", () => {
  it("accepts bigints, safe numbers, and decimal or hex strings", () => {
    expect(u256(0n).value).toBe(0n)
    expect(u256(U256_MAX).value).toBe(U256_MAX)
    expect(u256(1_000_000).value).toBe(1_000_000n)
    expect(u256("1000000").value).toBe(1_000_000n)
    expect(u256("0xf4240").value).toBe(1_000_000n)
  })

  it("rejects negatives, overflow, and lossy numbers", () => {
    expect(() => u256(-1n)).toThrow(/unsigned/)
    expect(() => u256(U256_MAX + 1n)).toThrow(/wider than 256 bits/)
    expect(() => u256(2 ** 53)).toThrow(/safe integer/)
    expect(() => u256(1.5)).toThrow(/dec\("1\.5"\)/)
    expect(() => u256("12abc")).toThrow(InvalidValueError)
  })
})

describe("dec", () => {
  it("canonicalises the decimal it was given", () => {
    expect(dec("3.5").value).toBe("3.5")
    expect(dec("3.50").value).toBe("3.5")
    expect(dec("003.5").value).toBe("3.5")
    expect(dec("+3.5").value).toBe("3.5")
    expect(dec("-0.0").value).toBe("0")
    expect(dec("5").value).toBe("5")
    expect(dec(5).value).toBe("5")
    expect(dec(-5n).value).toBe("-5")
  })

  it("holds exactly 18 decimal places", () => {
    expect(dec("0.000000000000000001").value).toBe("0.000000000000000001")
    expect(decUnits(dec("0.000000000000000001"))).toBe(1n)
    expect(decUnits(dec("3.5"))).toBe(3_500_000_000_000_000_000n)
    expect(decUnits(dec("-3.5"))).toBe(-3_500_000_000_000_000_000n)
  })

  it("errors rather than rounding away excess precision", () => {
    expect(() => dec("0.0000000000000000001")).toThrow(/19 fractional digits/)
    expect(() => dec("1e18")).toThrow(/not a decimal literal/)
    expect(() => dec("3.")).toThrow(/not a decimal literal/)
    expect(() => dec(".5")).toThrow(/not a decimal literal/)
  })

  it("refuses fractional numbers, since binary floats cannot hold them", () => {
    expect(() => dec(3.5)).toThrow(/dec\("3\.5"\)/)
    expect(() => dec(0.1 + 0.2)).toThrow(/dec\("0\.30000000000000004"\)/)
  })

  it("round-trips through its scaled units", () => {
    for (const literal of ["0", "1", "-1", "3.5", "-0.25", "123456789.000000000000000001"]) {
      expect(decFromUnits(decUnits(dec(literal))).value).toBe(dec(literal).value)
    }
  })
})

describe("str", () => {
  it("measures its 128-byte limit in bytes, not characters", () => {
    expect(str("a".repeat(128)).value).toHaveLength(128)
    expect(() => str("a".repeat(129))).toThrow(/129 UTF-8 bytes/)
    // "é" is two UTF-8 bytes, so 64 of them exactly fill the limit.
    expect(str("é".repeat(64)).value).toHaveLength(64)
    expect(() => str("é".repeat(65))).toThrow(/130 UTF-8 bytes/)
  })
})

describe("addr", () => {
  it("normalises to EIP-55 regardless of the case it was given", () => {
    expect(addr(VITALIK).value).toBe(VITALIK)
    expect(addr(VITALIK.toLowerCase()).value).toBe(VITALIK)
    expect(addr(`0x${VITALIK.slice(2).toUpperCase()}`).value).toBe(VITALIK)
  })

  it("catches a mistyped mixed-case address via its checksum", () => {
    const mistyped = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96046`
    expect(() => addr(mistyped)).toThrow(/EIP-55 checksum/)
    expect(() => addr(mistyped)).toThrow(/correctly checksummed form is 0x/)
  })

  it("rejects anything that is not 20 hex bytes", () => {
    expect(() => addr("0x1234")).toThrow(InvalidValueError)
    expect(() => addr(KEY)).toThrow(InvalidValueError)
  })
})

describe("key and bytes32", () => {
  it("accept hex or raw bytes and normalise to lowercase hex", () => {
    expect(key(`0x${"AB".repeat(32)}`).value).toBe(KEY)
    expect(bytes32(new Uint8Array(32).fill(0xab)).value).toBe(KEY)
  })

  it("reject anything that is not exactly 32 bytes", () => {
    expect(() => key(`0x${"ab".repeat(31)}`)).toThrow(/31 bytes/)
    expect(() => bytes32(new Uint8Array(31))).toThrow(/not exactly 32 bytes/)
    expect(() => key("not hex" as `0x${string}`)).toThrow(/not 0x-prefixed hex/)
  })
})

describe("toValue", () => {
  it("gives each bare form its unambiguous default type", () => {
    expect(toValue(true)).toEqual(bool(true))
    expect(toValue(10)).toEqual(i32(10))
    expect(toValue(10n)).toEqual(u256(10n))
    expect(toValue("hello")).toEqual(str("hello"))
  })

  it("leaves a hex-looking string a string, rather than guessing at a key", () => {
    expect(toValue(KEY)).toEqual(str(KEY))
  })

  it("leaves a tagged value's type and value alone", () => {
    for (const tagged of [dec("3.5"), i32(-42), u256(10n), str("hi"), bool(true), key(KEY)]) {
      expect(toValue(tagged)).toEqual(tagged)
    }
  })

  it("re-validates a tagged value rather than trusting its shape", () => {
    // The `validated` brand is type-level only, so nothing at runtime distinguishes a real u256
    // from an object that looks like one — out of JSON.parse, a config file, or an `as any`. Left
    // unchecked this was silent corruption, not an error: the ABI encoder would take the *string*
    // "1000" and write its UTF-8 bytes into the word, storing 2.27e76 on chain.
    const lookAlike = { type: "u256", value: "1000" } as unknown as string
    expect(toValue(lookAlike)).toEqual(u256(1000n))
    expect(toValue(lookAlike).value).toBe(1000n)

    // And a look-alike carrying something its type cannot hold is now rejected outright.
    expect(() => toValue({ type: "i32", value: 2 ** 40 } as unknown as string)).toThrow(
      InvalidValueError,
    )
    expect(() => toValue({ type: "addr", value: "0x1234" } as unknown as string)).toThrow(
      InvalidValueError,
    )
    expect(() => toValue({ type: "str", value: 42 } as unknown as string)).toThrow(
      InvalidValueError,
    )
  })

  it("rejects values it cannot type", () => {
    expect(() => toValue({ type: "nope", value: 1 } as unknown as string)).toThrow(
      UntypedValueError,
    )
    expect(() => toValue(new Uint8Array(32) as unknown as string)).toThrow(UntypedValueError)
    // `in` would have walked the prototype chain and accepted these as type tags.
    for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(() => toValue({ type: inherited, value: 1 } as unknown as string)).toThrow(
        UntypedValueError,
      )
    }
  })

  it("rejects an absent value by telling you to omit the attribute, not to infer a type", () => {
    // `undefined` and `null` are not assignable to ValueInput, but they still reach here at
    // runtime — from a spread of an optional-shaped object, or from data that never saw a type.
    for (const absent of [undefined, null]) {
      expect(() => toValue(absent as unknown as string)).toThrow(MissingValueError)
      expect(() => toValue(absent as unknown as string, "score")).toThrow(/Omit "score"/)
    }
    expect(() => toValue(undefined as unknown as string, "score")).toThrow(
      /attribute "score" is undefined/,
    )
  })
})

describe("the validated brand", () => {
  it("makes a hand-written value object a compile error", () => {
    // @ts-expect-error — only the tagged constructors produce a validated value, which is what
    // guarantees every value on the wire has been range- and format-checked.
    const forged: ReturnType<typeof i32> = { type: "i32", value: 3.5 }
    expect(forged.value).toBe(3.5)
  })
})
