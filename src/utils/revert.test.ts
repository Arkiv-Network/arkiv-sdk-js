import { describe, expect, it } from "bun:test"
import { BaseError, ContractFunctionRevertedError, type Hex, toHex } from "viem"
import { describeEntityRevert } from "./revert"

/**
 * Wraps a decoded revert the way viem delivers one: the `ContractFunctionRevertedError` is nested
 * in a cause chain, which is why `describeEntityRevert` walks rather than type-checks the top.
 */
function reverted(errorName: string, args: readonly unknown[]): BaseError {
  const inner = new ContractFunctionRevertedError({
    abi: [],
    functionName: "execute",
  })
  // The constructor cannot build `data` without a real ABI decode, so it is set directly — the
  // shape is what matters here, not how viem arrived at it.
  Object.assign(inner, { data: { errorName, args } })
  return new BaseError('The contract function "execute" reverted.', { cause: inner })
}

/** An Ident32 name cell: the name, left-aligned and null-padded to 32 bytes. */
const ident = (name: string): Hex => toHex(name, { size: 32 })

const KEY = `0x${"ab".repeat(32)}` as Hex

describe("describeEntityRevert", () => {
  it("ignores anything that is not a decoded engine revert", () => {
    expect(describeEntityRevert(new Error("boom"))).toBeUndefined()
    expect(describeEntityRevert("boom")).toBeUndefined()
    expect(describeEntityRevert(undefined)).toBeUndefined()
    expect(describeEntityRevert(new BaseError("no cause"))).toBeUndefined()
  })

  describe("attribute names", () => {
    it("names the offending character rather than printing the byte alone", () => {
      const message = describeEntityRevert(reverted("Ident32InvalidByte", [5n, "0x21"]))
      expect(message).toContain('"!"')
      expect(message).toContain("0x21")
      expect(message).toContain("byte 5")
    })

    it("quotes the name charset the SDK itself validates against", () => {
      const message = describeEntityRevert(reverted("Ident32InvalidByte", [0n, "0x2f"]))
      expect(message).toContain('"A"-"Z"')
      expect(message).toContain('"a"-"z"')
      expect(message).toContain("with a letter first")
    })

    it("renders an unprintable byte as a byte", () => {
      const message = describeEntityRevert(reverted("Ident32InvalidByte", [1n, "0x07"]))
      expect(message).toContain("byte 0x07")
    })
  })

  describe("names carried in a bytes32 cell", () => {
    it("reads the name back out of its null padding", () => {
      expect(
        describeEntityRevert(reverted("SystemAttributeNotWritable", [ident("$owner")])),
      ).toContain('"$owner"')
      expect(describeEntityRevert(reverted("TombstoneInCreate", [ident("gone")]))).toContain(
        '"gone"',
      )
      expect(describeEntityRevert(reverted("InvalidValueType", [ident("level"), 99]))).toContain(
        '"level"',
      )
    })
  })

  describe("the indexed flag", () => {
    it("says an indexed bytes attribute is the problem, not an unknown type", () => {
      // bytes is typeId 7; bit 7 is the indexed flag.
      expect(describeEntityRevert(reverted("InvalidValueType", [ident("body"), 0x87]))).toBe(
        '"body" is a bytes attribute flagged as indexed, and bytes are stored but never indexed',
      )
    })

    it("names the type and the flag when the node refuses an indexed attribute", () => {
      // str is typeId 8; with bit 7 set, a node that predates the flag sees 0x88.
      const message = describeEntityRevert(reverted("InvalidValueType", [ident("category"), 0x88]))
      expect(message).toContain('"category" has type str and is flagged as indexed (type id 136)')
      expect(message).toContain("may not support the indexed flag")
    })
    it("names the type when the node refuses an unindexed one", () => {
      const message = describeEntityRevert(reverted("InvalidValueType", [ident("title"), 0x08]))
      expect(message).toContain('"title" has type str (type id 8), which the node does not accept')
    })
    it("still reports a type id it cannot read as unknown", () => {
      expect(describeEntityRevert(reverted("InvalidValueType", [ident("x"), 0xff]))).toContain(
        "type id 255, which is not a known type",
      )
    })
  })

  describe("entity state", () => {
    it("abbreviates the key so it does not bury the sentence", () => {
      const message = describeEntityRevert(reverted("EntityNotFound", [KEY]))
      expect(message).toContain("…")
      expect(message).not.toContain(KEY)
    })

    it("explains a readonly entity in terms of what is still allowed", () => {
      const message = describeEntityRevert(reverted("ReadOnlyEntity", [KEY]))
      expect(message).toContain("readonly")
      expect(message).toContain("extended")
    })

    it("renders reserved creation flags as the bits they are", () => {
      const message = describeEntityRevert(reverted("ReservedCreationFlags", [0b100]))
      expect(message).toContain("0b00000100")
    })
  })

  describe("expiry", () => {
    it("says which way the extension went wrong", () => {
      const message = describeEntityRevert(reverted("ExpiryNotExtended", [KEY, 100n, 500n]))
      expect(message).toContain("already expires at block 500")
      expect(message).toContain("shorten")
    })

    it("names the chain's maximum lifetime", () => {
      const message = describeEntityRevert(
        reverted("ExpiryBeyondMaxLifetime", [9_000_100n, 100n, 7_884_000n]),
      )
      expect(message).toContain("block 9000100")
      expect(message).toContain("maximum lifetime of 7884000 blocks")
    })
  })

  it("falls back to naming the error when it has no tailored explanation", () => {
    const message = describeEntityRevert(reverted("SomeFutureError", []))
    expect(message).toBe("the engine rejected the batch with SomeFutureError")
  })
})
