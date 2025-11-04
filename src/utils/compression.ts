import type { BrotliWasmType } from "brotli-wasm"
import brotliPromise from "brotli-wasm"

let brotli: BrotliWasmType | null = null
export async function compress(data: Uint8Array): Promise<Uint8Array> {
  if (!brotli) {
    brotli = await brotliPromise
  }
  console.debug(`Compressing data (size: ${data.length})`)
  const brotliCompressed = brotli.compress(data)
  console.debug(`Brotli compressed data (size: ${brotliCompressed.length})`)
  return brotliCompressed
}

export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  if (!brotli) {
    brotli = await brotliPromise
  }
  return brotli.decompress(data)
}
