import { describe, expect, it } from "bun:test"
import { compress, decompress } from "./compression"

describe("compression", () => {
  it("should compress data", async () => {
    const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const compressed = await compress(originalData)

    expect(compressed).toBeInstanceOf(Uint8Array)
    expect(compressed.length).toBeGreaterThan(0)
    // Compressed data should be different from original
    expect(compressed).not.toEqual(originalData)
  })

  it("should compress data with large payload into smaller size", async () => {
    const originalData = new Uint8Array(1000).fill(1)
    const compressed = await compress(originalData)

    expect(compressed).toBeInstanceOf(Uint8Array)
    expect(compressed.length).toBeGreaterThan(0)
    expect(compressed.length).toBeLessThan(originalData.length)
  })

  it("should decompress data", async () => {
    const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const compressed = await compress(originalData)
    const decompressed = await decompress(compressed)

    expect(decompressed).toBeInstanceOf(Uint8Array)
    expect(decompressed).toEqual(originalData)
  })
})
