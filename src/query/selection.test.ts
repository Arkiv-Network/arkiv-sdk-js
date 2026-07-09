import { describe, expect, test } from "bun:test"
import { selectionToIncludeData } from "./selection"

const ALL = {
  key: true,
  attributes: true,
  payload: true,
  contentType: true,
  expiration: true,
  owner: true,
  creator: true,
  createdAtBlock: true,
  lastModifiedAtBlock: true,
  transactionIndexInBlock: true,
  operationIndexInTransaction: true,
}

const EMPTY = {
  key: false,
  attributes: false,
  payload: false,
  contentType: false,
  expiration: false,
  owner: false,
  creator: false,
  createdAtBlock: false,
  lastModifiedAtBlock: false,
  transactionIndexInBlock: false,
  operationIndexInTransaction: false,
}

describe("selectionToIncludeData", () => {
  test("select() with no argument selects everything", () => {
    expect(selectionToIncludeData()).toEqual(ALL)
  })

  test('select("*") selects everything', () => {
    expect(selectionToIncludeData("*")).toEqual(ALL)
  })

  test("empty object throws", () => {
    // @ts-expect-error – select requires at least one field
    expect(() => selectionToIncludeData({})).toThrow()
  })

  test("an all-false selection throws (no field is actually selected)", () => {
    expect(() => selectionToIncludeData({ key: false })).toThrow()
    expect(() => selectionToIncludeData({ owner: false, payload: false })).toThrow()
  })

  test("key: true selects only the key", () => {
    expect(selectionToIncludeData({ key: true })).toEqual({ ...EMPTY, key: true })
  })

  test("key is opt-in like every other field", () => {
    expect(selectionToIncludeData({ key: true }).key).toBe(true)
    expect(selectionToIncludeData({ attributes: true }).key).toBe(false)
    expect(selectionToIncludeData({ owner: true }).key).toBe(false)
  })

  test("attributes only (no key)", () => {
    expect(selectionToIncludeData({ attributes: true })).toEqual({
      ...EMPTY,
      attributes: true,
    })
  })

  test("payload only (no key)", () => {
    expect(selectionToIncludeData({ payload: true })).toEqual({
      ...EMPTY,
      payload: true,
    })
  })

  test("a single metadata field, selected flat (no key)", () => {
    expect(selectionToIncludeData({ owner: true })).toEqual({
      ...EMPTY,
      owner: true,
    })
  })

  test("expiresAtBlock maps to the RPC `expiration` field", () => {
    expect(selectionToIncludeData({ expiresAtBlock: true })).toEqual({
      ...EMPTY,
      expiration: true,
    })
  })

  test("several fields selected together", () => {
    expect(
      selectionToIncludeData({
        owner: true,
        creator: true,
        createdAtBlock: true,
        attributes: true,
      }),
    ).toEqual({
      ...EMPTY,
      owner: true,
      creator: true,
      createdAtBlock: true,
      attributes: true,
    })
  })

  test("key can be combined with other fields", () => {
    expect(selectionToIncludeData({ key: true, attributes: true })).toEqual({
      ...EMPTY,
      key: true,
      attributes: true,
    })
  })

  test("a field set to false is not selected", () => {
    expect(selectionToIncludeData({ owner: true, creator: false })).toEqual({
      ...EMPTY,
      owner: true,
    })
  })
})
