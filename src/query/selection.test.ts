import { describe, expect, it } from "bun:test"
import { toRpcSelect } from "./selection"

const EVERY_FIELD = {
  key: true,
  owner: true,
  creator: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  creationFlags: true,
  contentType: true,
  payload: true,
  attributeSchema: true,
  attributes: true,
}

describe("toRpcSelect", () => {
  it("selects everything for no argument or a star", () => {
    expect(toRpcSelect()).toEqual(EVERY_FIELD)
    expect(toRpcSelect("*")).toEqual(EVERY_FIELD)
  })

  it("sends every field, so what was asked for is legible in the request", () => {
    // The node defaults everything but `key` to off. Spelling out the false ones costs nothing and
    // pins the answer even if those defaults move.
    expect(toRpcSelect({ owner: true })).toEqual({
      key: false,
      owner: true,
      creator: false,
      createdAt: false,
      updatedAt: false,
      expiresAt: false,
      creationFlags: false,
      contentType: false,
      payload: false,
      attributeSchema: false,
      attributes: false,
    })
  })

  it("passes a named attribute subset through", () => {
    expect(
      toRpcSelect({ key: true, attributes: { projectId: true, version: true } }),
    ).toMatchObject({
      key: true,
      attributes: { projectId: true, version: true },
    })
  })

  it("drops names the subset turned off, and falls back to false when none are left", () => {
    expect(
      toRpcSelect({ key: true, attributes: { projectId: true, version: false } }),
    ).toMatchObject({ attributes: { projectId: true } })
    // An empty subset asks for no attributes, which is what `false` already means.
    expect(toRpcSelect({ key: true, attributes: {} })).toMatchObject({ attributes: false })
  })

  it("rejects a selection that asks for nothing", () => {
    // @ts-expect-error - AtLeastOne rejects this at compile time too
    expect(() => toRpcSelect({})).toThrow(/at least one field/)
    // The type system permits an explicit `false`; the node would answer it with empty rows.
    expect(() => toRpcSelect({ key: false })).toThrow(/at least one field/)
    expect(() => toRpcSelect({ key: false, attributes: {} })).toThrow(/at least one field/)
  })

  it("counts a named attribute subset as a selection in its own right", () => {
    expect(() => toRpcSelect({ attributes: { projectId: true } })).not.toThrow()
  })
})
