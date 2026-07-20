import { describe, expect, it } from "bun:test"
import { BLOCK_TIME } from "../consts"
import { InvalidAttributeError, InvalidAttributeKeyError, InvalidExpirationError } from "../errors"
import { validateAttribute, validateAttributeKey, validateExpiresIn } from "./validation"

describe("validateExpiresIn", () => {
  it("accepts positive integers that are a multiple of the block time", () => {
    expect(() => validateExpiresIn(BLOCK_TIME)).not.toThrow()
    expect(() => validateExpiresIn(1000)).not.toThrow()
    expect(() => validateExpiresIn(BLOCK_TIME * 12345)).not.toThrow()
  })

  it("throws for non-integer values", () => {
    expect(() => validateExpiresIn(51.5)).toThrow(InvalidExpirationError)
    expect(() => validateExpiresIn(1.5)).toThrow(InvalidExpirationError)
  })

  it("throws for values that are not a multiple of the block time", () => {
    expect(() => validateExpiresIn(51)).toThrow(InvalidExpirationError)
    expect(() => validateExpiresIn(999)).toThrow(InvalidExpirationError)
    expect(() => validateExpiresIn(1)).toThrow(InvalidExpirationError)
  })

  it("throws for zero and negative values", () => {
    expect(() => validateExpiresIn(0)).toThrow(InvalidExpirationError)
    expect(() => validateExpiresIn(-1000)).toThrow(InvalidExpirationError)
  })

  it("throws for NaN and non-finite values", () => {
    expect(() => validateExpiresIn(Number.NaN)).toThrow(InvalidExpirationError)
    expect(() => validateExpiresIn(Number.POSITIVE_INFINITY)).toThrow(InvalidExpirationError)
  })

  it("includes the offending value in the error message", () => {
    expect(() => validateExpiresIn(51)).toThrow(/51/)
  })
})

describe("validateAttribute", () => {
  it("accepts string values", () => {
    expect(() => validateAttribute({ key: "k", value: "1.5" })).not.toThrow()
    expect(() => validateAttribute({ key: "k", value: "anything" })).not.toThrow()
  })

  it("accepts non-negative integer numeric values", () => {
    expect(() => validateAttribute({ key: "k", value: 0 })).not.toThrow()
    expect(() => validateAttribute({ key: "k", value: 123 })).not.toThrow()
  })

  it("throws for non-integer numeric values", () => {
    expect(() => validateAttribute({ key: "k", value: 1.5 })).toThrow(InvalidAttributeError)
    expect(() => validateAttribute({ key: "k", value: Number.NaN })).toThrow(InvalidAttributeError)
  })

  it("throws for negative numeric values", () => {
    expect(() => validateAttribute({ key: "k", value: -5 })).toThrow(InvalidAttributeError)
    expect(() => validateAttribute({ key: "k", value: -0.5 })).toThrow(InvalidAttributeError)
  })

  it("includes the attribute key and value in the error message", () => {
    expect(() => validateAttribute({ key: "my_key", value: 1.5 })).toThrow(/my_key/)
    expect(() => validateAttribute({ key: "my_key", value: 1.5 })).toThrow(/1\.5/)
  })
})

describe("validateAttributeKey", () => {
  it("accepts valid Ident32 keys", () => {
    expect(() => validateAttributeKey("a")).not.toThrow()
    expect(() => validateAttributeKey("tag")).not.toThrow()
    expect(() => validateAttributeKey("num_attr")).not.toThrow()
    expect(() => validateAttributeKey("a.b-c_d9")).not.toThrow()
    expect(() => validateAttributeKey("a".repeat(32))).not.toThrow()
  })

  it("throws for an empty key", () => {
    expect(() => validateAttributeKey("")).toThrow(InvalidAttributeKeyError)
  })

  it("throws when the key does not start with a lowercase letter", () => {
    expect(() => validateAttributeKey("Tag")).toThrow(InvalidAttributeKeyError)
    expect(() => validateAttributeKey("1tag")).toThrow(InvalidAttributeKeyError)
    expect(() => validateAttributeKey("_tag")).toThrow(InvalidAttributeKeyError)
    expect(() => validateAttributeKey(".tag")).toThrow(InvalidAttributeKeyError)
  })

  it("throws for invalid characters after the first", () => {
    expect(() => validateAttributeKey("strAttr")).toThrow(InvalidAttributeKeyError)
    expect(() => validateAttributeKey("has space")).toThrow(InvalidAttributeKeyError)
    expect(() => validateAttributeKey("has:colon")).toThrow(InvalidAttributeKeyError)
    expect(() => validateAttributeKey("héllo")).toThrow(InvalidAttributeKeyError)
  })

  it("throws for keys longer than 32 bytes", () => {
    expect(() => validateAttributeKey("a".repeat(33))).toThrow(InvalidAttributeKeyError)
  })

  it("names the offending character and position", () => {
    expect(() => validateAttributeKey("strAttr")).toThrow(/"A" at position 3/)
  })

  it("is applied by validateAttribute", () => {
    expect(() => validateAttribute({ key: "strAttr", value: "x" })).toThrow(
      InvalidAttributeKeyError,
    )
  })
})
