import { describe, expect, it } from "bun:test"
import type { RpcEntity } from "../types/rpcSchema"
import { entityFromRpcResult } from "./entities"

const KEY = `0x${"aa".repeat(32)}` as const

/** A minimal row, with only the field under test varying. */
function rowWith(creationFlags: RpcEntity["creationFlags"]): RpcEntity {
  return { key: KEY, creationFlags }
}

describe("the creationFlags projection", () => {
  it("decodes the bare byte a pre-spec node sends", () => {
    expect(entityFromRpcResult(rowWith(0b11)).creationFlags).toEqual({
      readonly: true,
      permissionlessExtension: true,
      raw: 0b11,
    })
  })

  it("prefers raw over the booleans sent alongside it", () => {
    // `raw` is the byte the engine stored, so it is the one reading that cannot disagree with what
    // is on chain — and it keeps bits this SDK has no name for visible.
    const flags = entityFromRpcResult(
      rowWith({ readonly: false, permissionlessExtension: false, raw: 0b101 }),
    ).creationFlags
    expect(flags).toEqual({ readonly: true, permissionlessExtension: false, raw: 0b101 })
  })

  it("reads raw as the 0x quantity every other numeric field already uses", () => {
    // createdAt, updatedAt and expiresAt are all hex on this surface, so a node rendering the flags
    // byte the same way is the expected spelling, not a malformed response.
    expect(
      entityFromRpcResult(rowWith({ raw: "0x03" } as unknown as RpcEntity["creationFlags"]))
        .creationFlags,
    ).toEqual({ readonly: true, permissionlessExtension: true, raw: 3 })
  })

  it("falls back to the booleans when no byte arrives", () => {
    expect(
      entityFromRpcResult(
        rowWith({ readonly: true, permissionlessExtension: false } as RpcEntity["creationFlags"]),
      ).creationFlags,
    ).toEqual({ readonly: true, permissionlessExtension: false, raw: 0b1 })
  })

  it("drops an unreadable encoding instead of failing the whole read", () => {
    // Nothing on the decode path catches, so a throw here would not fail this field — it would
    // fail the entire getEntity/fetch and take every other entity on the page with it.
    for (const unreadable of [{}, { raw: "nonsense" }, { raw: 999 }, "flags"]) {
      const entity = entityFromRpcResult(
        rowWith(unreadable as unknown as RpcEntity["creationFlags"]),
      )
      expect(entity.creationFlags).toBeUndefined()
      expect(entity.key).toBe(KEY)
    }
  })

  it("stays undefined when the projection did not ask for it", () => {
    expect(entityFromRpcResult({ key: KEY }).creationFlags).toBeUndefined()
  })
})
