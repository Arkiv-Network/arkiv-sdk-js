// src/utils/compression.ts

import type { BrotliWasmType } from "brotli-wasm"

// Detect if we're in Node.js environment
const isNode = typeof process !== "undefined" && process.versions?.node != null

let zlib: typeof import("zlib") | null = null
let brotli: BrotliWasmType | null = null

// Lazy load zlib (Node.js only)
async function getZlib(): Promise<typeof import("zlib") | null> {
  if (!isNode) return null

  if (!zlib) {
    try {
      zlib = await import("zlib")
    } catch (error) {
      console.error("Error importing zlib", error)
      return null
    }
  }
  return zlib
}

// Lazy load brotli-wasm (browser/fallback)
async function getBrotli(): Promise<BrotliWasmType | null> {
  if (brotli) return brotli

  try {
    const brotliModule = await import("brotli-wasm")
    brotli = brotliModule.default || brotliModule
  } catch (error) {
    console.error("Error importing brotli-wasm", error)
    return null
  }

  return brotli
}

export async function compress(data: Uint8Array): Promise<Uint8Array> {
  console.debug(`Compressing data (size: ${data.length})`)

  // Try Node.js zlib first (if available)
  if (isNode) {
    const zlibModule = await getZlib()
    if (zlibModule) {
      try {
        // zlib.brotliCompress expects Buffer, returns Buffer
        const buffer = Buffer.from(data)
        const compressed = zlibModule.brotliCompressSync(buffer)
        const result = new Uint8Array(compressed)
        console.debug(`Brotli compressed with zlib (size: ${result.length})`)
        return result
      } catch (error) {
        console.warn("zlib compression failed, falling back to brotli-wasm", error)
      }
    }
  }

  // Fallback to brotli-wasm (browser or if zlib fails)
  const brotliInstance = await getBrotli()
  if (!brotliInstance) {
    console.warn("Brotli instance not found, not compressing data")
    return data
  }

  const brotliCompressed = brotliInstance.compress(data)
  console.debug(`Brotli compressed with wasm (size: ${brotliCompressed.length})`)
  return brotliCompressed
}

export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  // Try Node.js zlib first (if available)
  if (isNode) {
    const zlibModule = await getZlib()
    if (zlibModule) {
      try {
        // zlib.brotliDecompress expects Buffer, returns Buffer
        const buffer = Buffer.from(data)
        const decompressed = zlibModule.brotliDecompressSync(buffer)
        const result = new Uint8Array(decompressed)
        console.debug(`Brotli decompressed with zlib (size: ${result.length})`)
        return result
      } catch (error) {
        console.warn("zlib decompression failed, falling back to brotli-wasm", error)
      }
    }
  }

  // Fallback to brotli-wasm (browser or if zlib fails)
  const brotliInstance = await getBrotli()
  if (!brotliInstance) {
    console.warn("Brotli instance not found, not decompressing data")
    return data
  }

  return brotliInstance.decompress(data)
}
