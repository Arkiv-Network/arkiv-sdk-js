// src/utils/compression.ts
import type { BrotliWasmType } from "brotli-wasm"

let brotli: BrotliWasmType | null = null
let brotliPromise: Promise<BrotliWasmType> | null = null

async function getBrotli(): Promise<BrotliWasmType | null> {
  if (brotli) return brotli

  if (!brotliPromise) {
    try {
      const module = await import("brotli-wasm")
      brotliPromise = Promise.resolve(module.default)
      brotli = await brotliPromise
    } catch (error) {
      console.error("Error importing brotli-wasm", error)
      brotli = require("brotli-wasm")
    }
  }

  brotli = await brotliPromise
  return brotli
}

export async function compress(data: Uint8Array): Promise<Uint8Array> {
  const brotliInstance = await getBrotli()
  console.debug(`Compressing data (size: ${data.length})`)
  if (!brotliInstance) {
    console.warn("Brotli instance not found, not compressing data")
    return data
  }
  const brotliCompressed = brotliInstance.compress(data)
  console.debug(`Brotli compressed data (size: ${brotliCompressed.length})`)
  return brotliCompressed
}

export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const brotliInstance = await getBrotli()
  if (!brotliInstance) {
    console.warn("Brotli instance not found, not decompressing data")
    return data
  }
  return brotliInstance.decompress(data)
}
