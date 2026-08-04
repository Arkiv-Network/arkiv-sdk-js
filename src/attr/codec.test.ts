import { describe, expect, it } from "bun:test"
import type { Hex } from "viem"
import {
  decodeRpcValue,
  decodeValueBytes,
  encodeAbiAttribute,
  encodeTombstone,
  encodeValueBytes,
} from "./codec"
import { InvalidValueError, UnknownAttributeTypeError } from "./errors"
import type { ArkivValue } from "./types"
import { addr, bool, bytes32, dec, i32, key, str, u256 } from "./values"

const ZERO = `0x${"00".repeat(32)}` as Hex
const KEY = `0x${"ab".repeat(32)}` as Hex
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

/** One value of every user-settable type, including the awkward edges of each. */
const SAMPLES: ArkivValue[] = [
  bool(true),
  bool(false),
  i32(0),
  i32(-42),
  i32(2147483647),
  i32(-2147483648),
  u256(0n),
  u256(2n ** 256n - 1n),
  dec("0"),
  dec("3.5"),
  dec("-3.5"),
  dec("-0.000000000000000001"),
  bytes32(KEY),
  key(KEY),
  addr(VITALIK),
  str(""),
  str("hello"),
  str("é".repeat(64)),
]

describe("ABI value encoding", () => {
  it("round-trips every type", () => {
    for (const value of SAMPLES) {
      const back = decodeValueBytes(value.type, encodeValueBytes(value))
      expect(back.type).toBe(value.type)
      expect(back.value).toEqual(value.value)
    }
  })

  it("gives every word type exactly 32 bytes", () => {
    for (const value of SAMPLES) {
      if (value.type === "str") continue
      expect(encodeValueBytes(value)).toHaveLength(2 + 64)
    }
  })

  it("sign-extends a negative i32 across the whole word, as Solidity does", () => {
    expect(encodeValueBytes(i32(-1))).toBe(`0x${"ff".repeat(32)}`)
    expect(encodeValueBytes(i32(-42))).toBe(`0x${"ff".repeat(31)}d6`)
    expect(encodeValueBytes(i32(42))).toBe(`0x${"00".repeat(31)}2a`)
  })

  it("stores a dec as its two's-complement scaled int256", () => {
    const scaled = (value: string) => BigInt.asIntN(256, BigInt(encodeValueBytes(dec(value))))
    expect(scaled("1.5")).toBe(1_500_000_000_000_000_000n)
    expect(scaled("-1.5")).toBe(-1_500_000_000_000_000_000n)
    expect(scaled("0")).toBe(0n)
  })

  it("right-aligns an address and a bool", () => {
    expect(encodeValueBytes(addr(VITALIK))).toBe(
      `0x${"00".repeat(12)}${VITALIK.slice(2).toLowerCase()}`,
    )
    expect(encodeValueBytes(bool(true))).toBe(`0x${"00".repeat(31)}01`)
    expect(encodeValueBytes(bool(false))).toBe(ZERO)
  })

  it("gives a str its raw UTF-8 bytes, with no padding", () => {
    expect(encodeValueBytes(str("hi"))).toBe("0x6869")
    expect(encodeValueBytes(str(""))).toBe("0x")
    // Two bytes per "é", so no relationship to a 32-byte word.
    expect(encodeValueBytes(str("é"))).toBe("0xc3a9")
  })

  it("rejects a word a well-formed encoder would not have produced", () => {
    expect(() => decodeValueBytes("bool", `0x${"00".repeat(31)}02`)).toThrow(/exactly 0 or 1/)
    expect(() => decodeValueBytes("u256", "0x2a")).toThrow(/must be 32 bytes, got 1/)
    // An i32 whose upper bytes contradict its sign bit.
    expect(() => decodeValueBytes("i32", `0xff${"00".repeat(31)}`)).toThrow(/sign-extended/)
    // An address with junk above its 20 bytes.
    expect(() => decodeValueBytes("addr", `0x${"ab".repeat(32)}`)).toThrow(/zero-padded/)
  })
})

describe("encodeAbiAttribute", () => {
  it("packs the name left-aligned into its bytes32 cell", () => {
    const attribute = encodeAbiAttribute("level", i32(10))
    // "level" is 6c6576656c, null-padded to 32 bytes.
    expect(attribute.name).toBe(`0x6c6576656c${"00".repeat(27)}`)
    expect(attribute.typeId).toBe(2)
  })

  it("encodes a tombstone as a zero-length value under typeId 0", () => {
    expect(encodeTombstone("flagged")).toEqual({
      name: `0x666c6167676564${"00".repeat(25)}`,
      typeId: 0,
      value: "0x",
    })
  })
})

describe("decodeRpcValue", () => {
  it("reads the JSON encoding each type declares", () => {
    expect(decodeRpcValue("bool", true).value).toBe(true)
    expect(decodeRpcValue("i32", -42).value).toBe(-42)
    expect(decodeRpcValue("u256", "0xf4240").value).toBe(1_000_000n)
    expect(decodeRpcValue("dec", "3.5").value).toBe("3.5")
    expect(decodeRpcValue("dec", "-0.25").value).toBe("-0.25")
    expect(decodeRpcValue("bytes32", KEY).value).toBe(KEY)
    expect(decodeRpcValue("str", "hello").value).toBe("hello")
    expect(decodeRpcValue("addr", VITALIK.toLowerCase()).value).toBe(VITALIK)
    expect(decodeRpcValue("key", KEY).value).toBe(KEY)
  })

  it("takes an integer however it is rendered", () => {
    // QUANTITY is the spec's encoding; decimal strings and numbers are tolerated.
    expect(decodeRpcValue("u256", "0x2a").value).toBe(42n)
    expect(decodeRpcValue("u256", "42").value).toBe(42n)
    expect(decodeRpcValue("u256", 42).value).toBe(42n)
    expect(decodeRpcValue("i32", "-42").value).toBe(-42)
  })

  it("decodes the system-only bytes type, which only ever arrives as a payload", () => {
    expect(decodeRpcValue("bytes", "0xDEADBEEF").value).toBe("0xdeadbeef")
  })

  it("names the type it does not recognise, and says to upgrade", () => {
    expect(() => decodeRpcValue("int", "x")).toThrow(UnknownAttributeTypeError)
    expect(() => decodeRpcValue("int", "x")).toThrow(/upgrade @arkiv-network\/sdk/)
    // The pre-spec wire form: a typeId where the JSON-RPC surface names a tag.
    expect(() => decodeRpcValue(3 as unknown as string, "0x2a")).toThrow(UnknownAttributeTypeError)
  })

  it("does not mistake an inherited Object key for a type tag", () => {
    // `type in TYPE_IDS` walks the prototype chain, so these passed the check and then fell off
    // the end of the exhaustive switch, returning `undefined` — the caller got a TypeError from
    // `entity.attributes.foo.value` instead of "upgrade the SDK".
    for (const inherited of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(() => decodeRpcValue(inherited, 1)).toThrow(UnknownAttributeTypeError)
    }
  })

  it("rejects a value whose JSON shape contradicts its declared type", () => {
    expect(() => decodeRpcValue("u256", "not a number")).toThrow(InvalidValueError)
    expect(() => decodeRpcValue("str", 42)).toThrow(/expected a string/)
    expect(() => decodeRpcValue("bool", "yes")).toThrow(/not a boolean/)
    expect(() => decodeRpcValue("i32", 1.5)).toThrow(/not an integer/)
  })
})
