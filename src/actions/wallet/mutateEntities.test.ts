import { expect, test } from "bun:test"
import type { ArkivClient } from "../../clients/baseClient"
import { mutateEntities } from "./mutateEntities"

test("throws when no operations are provided", () => {
  expect(mutateEntities({} as ArkivClient, {})).rejects.toThrowError("No operations to perform")
})

test("throws when all operation arrays are empty", () => {
  expect(
    mutateEntities({} as ArkivClient, { creates: [], updates: [], patches: [], deletes: [] }),
  ).rejects.toThrowError("No operations to perform")
})
