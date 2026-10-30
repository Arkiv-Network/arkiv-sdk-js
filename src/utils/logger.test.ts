import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { getLogger } from "./logger"

describe("getLogger", () => {
  const originalDebug = process.env.DEBUG
  let log: ReturnType<typeof spyOn<Console, "log">>

  beforeEach(() => {
    log = spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    log.mockRestore()
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
  })

  /** Which of `scopes` log anything under `debug`. */
  function enabledScopes(debug: string, scopes: string[]): string[] {
    process.env.DEBUG = debug
    return scopes.filter((scope) => {
      log.mockClear()
      getLogger(scope)("hello")
      return log.mock.calls.length > 0
    })
  }

  test("logs only the namespaces a pattern names", () => {
    expect(enabledScopes("arkiv:a", ["a", "b"])).toEqual(["a"])
  })

  test("a wildcard enables every namespace under its prefix", () => {
    expect(enabledScopes("arkiv:*", ["a", "b"])).toEqual(["a", "b"])
    expect(enabledScopes("arkiv:a:*", ["a:x", "a:y", "b:x"])).toEqual(["a:x", "a:y"])
  })

  test("a -pattern excludes what it matches and leaves the rest enabled", () => {
    expect(enabledScopes("arkiv:*,-arkiv:a", ["a", "b", "c"])).toEqual(["b", "c"])
    expect(enabledScopes("arkiv:* -arkiv:a:*", ["a:x", "a:y", "b:x"])).toEqual(["b:x"])
  })

  test("an exclusion alone enables nothing", () => {
    expect(enabledScopes("-arkiv:a", ["a", "b"])).toEqual([])
  })
})
