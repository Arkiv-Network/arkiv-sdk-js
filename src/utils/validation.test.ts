import { describe, expect, it } from "bun:test"
import { BLOCK_TIME } from "../consts"
import { InvalidExpirationError } from "../errors"
import { validateExpiresIn } from "./validation"

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
