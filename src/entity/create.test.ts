import { describe, expect, it } from "bun:test"
import { concat, decodeAbiParameters, keccak256, pad, parseAbiParameters, toHex } from "viem"
import { encodeAttributes } from "../attr/attributes"
import { dec, i32, str, u256 } from "../attr/values"
import { ARKIV_ADDRESS } from "../consts"
import { InvalidCreationFlagsError } from "./errors"
import { decodeCreationFlags, encodeCreationFlags } from "./flags"
import { MAX_SALT, predictEntityKey, randomSalt, validateSalt } from "./key"
import { createOperation } from "./operations"
import { OperationType } from "./params"

const OWNER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

const CREATE_PARAMS = parseAbiParameters(
  "(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)",
)

/** Decodes an operation's payload back into the Create struct it encodes. */
function decodeCreate(operationData: `0x${string}`) {
  const [create] = decodeAbiParameters(CREATE_PARAMS, operationData)
  return create
}

describe("creation flags", () => {
  it("packs each flag into its documented bit", () => {
    expect(encodeCreationFlags({})).toBe(0b00)
    expect(encodeCreationFlags({ readonly: true })).toBe(0b01)
    expect(encodeCreationFlags({ permissionlessExtension: true })).toBe(0b10)
    expect(encodeCreationFlags({ readonly: true, permissionlessExtension: true })).toBe(0b11)
    expect(encodeCreationFlags()).toBe(0)
  })

  it("round-trips through the byte", () => {
    for (const readonly of [true, false]) {
      for (const permissionlessExtension of [true, false]) {
        const decoded = decodeCreationFlags(
          encodeCreationFlags({ readonly, permissionlessExtension }),
        )
        expect(decoded.readonly).toBe(readonly)
        expect(decoded.permissionlessExtension).toBe(permissionlessExtension)
      }
    }
  })

  it("refuses a value that is not a byte at all", () => {
    // Malformed input
    expect(() => decodeCreationFlags(256)).toThrow(InvalidCreationFlagsError)
    expect(() => decodeCreationFlags(256)).toThrow(/not a byte/)
    expect(() => decodeCreationFlags(-1)).toThrow(/not a byte/)
  })

  it("keeps the raw byte, so unknown state stays visible", () => {
    expect(decodeCreationFlags(0b11).raw).toBe(3)
  })
})

describe("salt", () => {
  it("generates 128 bits within the wire field", () => {
    for (let i = 0; i < 32; i++) {
      const salt = randomSalt()
      expect(salt).toBeGreaterThanOrEqual(0n)
      expect(salt).toBeLessThanOrEqual(MAX_SALT)
    }
  })

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 64 }, () => randomSalt().toString()))
    expect(seen.size).toBe(64)
  })

  it("bounds a caller-supplied salt to the uint128 field", () => {
    expect(validateSalt(0n)).toBe(0n)
    expect(validateSalt(MAX_SALT)).toBe(MAX_SALT)
    expect(() => validateSalt(MAX_SALT + 1n)).toThrow(/uint128/)
    expect(() => validateSalt(-1n)).toThrow(/uint128/)
  })
})

describe("predictEntityKey", () => {
  it("is deterministic in owner, nonce and salt", () => {
    const base = { owner: OWNER, nonce: 0n, salt: 7n, chainId: 1 } as const
    expect(predictEntityKey(base)).toBe(predictEntityKey(base))
    expect(predictEntityKey({ ...base, nonce: 1n })).not.toBe(predictEntityKey(base))
    expect(predictEntityKey({ ...base, salt: 8n })).not.toBe(predictEntityKey(base))
    expect(
      predictEntityKey({ ...base, owner: "0x1111111111111111111111111111111111111111" }),
    ).not.toBe(predictEntityKey(base))
  })

  it("separates chains through the domain", () => {
    const base = { owner: OWNER, nonce: 0n, salt: 0n } as const
    expect(predictEntityKey({ ...base, chainId: 1 })).not.toBe(
      predictEntityKey({ ...base, chainId: 2 }),
    )
  })

  it("returns a 32-byte key", () => {
    expect(predictEntityKey({ owner: OWNER, nonce: 0n, salt: 0n, chainId: 1 })).toMatch(
      /^0x[0-9a-f]{64}$/,
    )
  })
})

describe("the Create operation", () => {
  const build = (over: Partial<Parameters<typeof createOperation>[0]> = {}) =>
    createOperation({
      salt: 42n,
      expiry: { expiresAt: 0n, minLifetime: 43_200n },
      creationFlags: 0,
      attributes: [],
      ...over,
    })

  it("carries the CREATE tag", () => {
    expect(build().operation).toBe(OperationType.Create)
  })

  it("round-trips its fields through the ABI", () => {
    const create = decodeCreate(
      build({
        salt: 42n,
        expiry: { expiresAt: 1_200_000n, minLifetime: 100n },
        creationFlags: 0b11,
      }).operationData,
    )
    expect(create.salt).toBe(42n)
    expect(create.expiresAt).toBe(1_200_000n)
    expect(create.minLifetime).toBe(100n)
    expect(create.creationFlags).toBe(3)
  })

  it("carries attributes as (name, typeId, bytes), sorted ascending by name", () => {
    const create = decodeCreate(
      build({
        attributes: encodeAttributes({ zebra: i32(1), apple: str("x"), mango: u256(2n) }),
      }).operationData,
    )
    const names = create.attributes.map((a) => a.name)
    expect(names).toEqual([...names].sort())
    expect(create.attributes.map((a) => a.typeId)).toEqual([8, 4, 2]) // apple str, mango u256, zebra i32
  })

  it("sends the payload and content type as system cells, ahead of user attributes", () => {
    const create = decodeCreate(
      build({
        attributes: encodeAttributes(
          { level: i32(10) },
          { payload: new Uint8Array([0xde, 0xad]), contentType: "application/json" },
        ),
      }).operationData,
    )
    const byName = Object.fromEntries(create.attributes.map((a) => [a.name, a]))

    // "$" sorts below every letter, so the system cells lead.
    expect(create.attributes[0].name).toBe(toHex("$contentType", { size: 32 }))
    expect(create.attributes[1].name).toBe(toHex("$payload", { size: 32 }))

    expect(byName[toHex("$payload", { size: 32 })]).toMatchObject({ typeId: 7, value: "0xdead" })
    expect(byName[toHex("$contentType", { size: 32 })].typeId).toBe(8)
    expect(byName[toHex("level", { size: 32 })].typeId).toBe(2)
  })

  it("omits the system cells entirely when there is no payload or content type", () => {
    const create = decodeCreate(
      build({ attributes: encodeAttributes({ level: i32(10) }) }).operationData,
    )
    expect(create.attributes).toHaveLength(1)
    expect(create.attributes[0].name).toBe(toHex("level", { size: 32 }))
  })

  it("encodes each value type at its documented width", () => {
    const create = decodeCreate(
      build({
        attributes: encodeAttributes({ n: i32(-42), big: u256(1n), d: dec("1.5"), s: str("hi") }),
      }).operationData,
    )
    const byName = Object.fromEntries(create.attributes.map((a) => [a.name, a.value]))
    // Word types are exactly 32 bytes; i32 is sign-extended.
    expect(byName[toHex("n", { size: 32 })]).toBe(`0x${"ff".repeat(31)}d6`)
    expect(byName[toHex("big", { size: 32 })]).toBe(`0x${"00".repeat(31)}01`)
    expect(BigInt(byName[toHex("d", { size: 32 })])).toBe(1_500_000_000_000_000_000n)
    // str is raw UTF-8, not padded.
    expect(byName[toHex("s", { size: 32 })]).toBe("0x6869")
  })
})
