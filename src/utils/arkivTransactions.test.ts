import { describe, expect, it } from "bun:test"
import { InvalidAttributeError, InvalidExpirationError } from "../errors"
import { opsToTxData } from "./arkivTransactions"

const validCreate = {
  payload: new Uint8Array([1, 2, 3]),
  contentType: "text/plain",
  attributes: [{ key: "k", value: "v" as string | number }],
  expiresIn: 1000,
}

describe("opsToTxData expiration validation", () => {
  it("builds tx data for a valid create", () => {
    expect(typeof opsToTxData({ creates: [validCreate] })).toBe("string")
  })

  it("throws when a create expiresIn is not a multiple of the block time", () => {
    expect(() => opsToTxData({ creates: [{ ...validCreate, expiresIn: 51 }] })).toThrow(
      InvalidExpirationError,
    )
  })

  it("throws when an update expiresIn is not an integer", () => {
    expect(() =>
      opsToTxData({
        updates: [{ ...validCreate, entityKey: "0x123", expiresIn: 51.5 }],
      }),
    ).toThrow(InvalidExpirationError)
  })

  it("throws when an extension expiresIn is not a multiple of the block time", () => {
    expect(() => opsToTxData({ extensions: [{ entityKey: "0x123", expiresIn: 999 }] })).toThrow(
      InvalidExpirationError,
    )
  })
})

describe("opsToTxData attribute validation", () => {
  it("throws when a numeric attribute value is not an integer", () => {
    expect(() =>
      opsToTxData({
        creates: [{ ...validCreate, attributes: [{ key: "n", value: 1.5 }] }],
      }),
    ).toThrow(InvalidAttributeError)
  })

  it("accepts integer numeric attribute values", () => {
    expect(
      typeof opsToTxData({
        creates: [{ ...validCreate, attributes: [{ key: "n", value: 123 }] }],
      }),
    ).toBe("string")
  })

  it("accepts string attribute values that look like non-integers", () => {
    expect(
      typeof opsToTxData({
        creates: [{ ...validCreate, attributes: [{ key: "n", value: "1.5" }] }],
      }),
    ).toBe("string")
  })
})
