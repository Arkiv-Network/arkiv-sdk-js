import { describe, expect, it } from "bun:test"
import type { Hex } from "viem"
import { decodeRpcValue, decodeValueWords, encodeAbiAttribute, encodeValueWords } from "./codec"
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

describe("ABI word encoding", () => {
  it("round-trips every type through its four words", () => {
    for (const value of SAMPLES) {
      const back = decodeValueWords(value.type, encodeValueWords(value))
      expect(back.type).toBe(value.type)
      expect(back.value).toEqual(value.value)
    }
  })

  it("puts single-word types in word 0 and leaves the rest zero", () => {
    const [word0, ...rest] = encodeValueWords(u256(42n))
    expect(word0).toBe(`0x${"00".repeat(31)}2a`)
    expect(rest).toEqual([ZERO, ZERO, ZERO])
  })

  it("sign-extends a negative i32 across the whole word, as Solidity does", () => {
    expect(encodeValueWords(i32(-1))[0]).toBe(`0x${"ff".repeat(32)}`)
    expect(encodeValueWords(i32(-42))[0]).toBe(`0x${"ff".repeat(31)}d6`)
    expect(encodeValueWords(i32(42))[0]).toBe(`0x${"00".repeat(31)}2a`)
  })

  it("stores a dec as its two's-complement scaled int256", () => {
    const scaled = (value: string) => BigInt.asIntN(256, BigInt(encodeValueWords(dec(value))[0]))
    expect(scaled("1.5")).toBe(1_500_000_000_000_000_000n)
    expect(scaled("-1.5")).toBe(-1_500_000_000_000_000_000n)
    expect(scaled("0")).toBe(0n)
  })

  it("right-aligns an address and a bool", () => {
    expect(encodeValueWords(addr(VITALIK))[0]).toBe(
      `0x${"00".repeat(12)}${VITALIK.slice(2).toLowerCase()}`,
    )
    expect(encodeValueWords(bool(true))[0]).toBe(`0x${"00".repeat(31)}01`)
    expect(encodeValueWords(bool(false))[0]).toBe(ZERO)
  })

  it("packs a string left-aligned across the words it needs", () => {
    const words = encodeValueWords(str("hi"))
    expect(words[0].slice(0, 6)).toBe("0x6869")
    expect(words[1]).toBe(ZERO)
    // 128 bytes exactly fills all four words.
    expect(encodeValueWords(str("a".repeat(128))).every((word) => word !== ZERO)).toBe(true)
  })

  it("rejects a bool word holding anything but 0 or 1", () => {
    expect(() => decodeValueWords("bool", [`0x${"00".repeat(31)}02`, ZERO, ZERO, ZERO])).toThrow(
      InvalidValueError,
    )
  })

  it("refuses to encode the system-only bytes type", () => {
    expect(() => decodeValueWords("bytes", [ZERO, ZERO, ZERO, ZERO])).toThrow(/system-only/)
  })
})

describe("encodeAbiAttribute", () => {
  it("packs the name left-aligned into its bytes32 cell", () => {
    const attribute = encodeAbiAttribute("level", i32(10))
    // "level" is 6c6576656c, null-padded to 32 bytes.
    expect(attribute.name).toBe(`0x6c6576656c${"00".repeat(27)}`)
    expect(attribute.valueType).toBe(2)
  })
})

describe("decodeRpcValue", () => {
  it("reads back what the node renders for each type", () => {
    expect(decodeRpcValue(1, "true").value).toBe(true)
    expect(decodeRpcValue(1, "false").value).toBe(false)
    expect(decodeRpcValue(2, "-42").value).toBe(-42)
    expect(decodeRpcValue(3, "123456789").value).toBe(123456789n)
    expect(decodeRpcValue(4, "3.5").value).toBe("3.5")
    expect(decodeRpcValue(4, "-0.25").value).toBe("-0.25")
    expect(decodeRpcValue(5, KEY).value).toBe(KEY)
    expect(decodeRpcValue(7, "hello").value).toBe("hello")
    expect(decodeRpcValue(8, VITALIK.toLowerCase()).value).toBe(VITALIK)
    expect(decodeRpcValue(9, KEY).value).toBe(KEY)
  })

  it("also accepts integers in 0x QUANTITY form", () => {
    expect(decodeRpcValue(3, "0xf4240").value).toBe(1_000_000n)
    expect(decodeRpcValue(2, "0xffffffd6").value).toBe(-42)
  })

  it("decodes the system-only bytes type, which only ever arrives as a payload", () => {
    expect(decodeRpcValue(6, "0xDEADBEEF").value).toBe("0xdeadbeef")
  })

  it("names the typeId it does not recognise, and says to upgrade", () => {
    expect(() => decodeRpcValue(42, "x")).toThrow(UnknownAttributeTypeError)
    expect(() => decodeRpcValue(42, "x")).toThrow(/upgrade @arkiv-network\/sdk/)
  })

  it("round-trips a value through the RPC rendering", () => {
    expect(decodeRpcValue(4, dec("3.5").value).value).toBe("3.5")
    expect(decodeRpcValue(7, str("héllo").value).value).toBe("héllo")
  })
})
