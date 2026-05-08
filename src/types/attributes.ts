import { Hex } from "viem"

/**
 * An attribute attached to an entity. Three value types are supported:
 *
 * - **number** — unsigned integer, encoded as a 256-bit big-endian value in the
 *   first 32 bytes on-chain.
 * - **string** — UTF-8 text, max 128 bytes. Encoded as raw UTF-8 bytes on-chain.
 * - **Hex** — a 32-byte entity key reference (e.g. `0xabc...`). Must be exactly
 *   32 bytes (64 hex chars + `0x` prefix). Encoded as raw bytes on-chain.
 *
 * **Attribute name constraints:**
 * - Charset: `a-z`, `0-9`, `.`, `-`, `_` only. No uppercase letters.
 * - Max length: 32 bytes.
 */
export type Attribute = {
  key: string
  value: number | string | Hex
}
