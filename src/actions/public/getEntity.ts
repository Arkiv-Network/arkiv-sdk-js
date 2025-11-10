import { bytesToHex, type Hex, hexToBytes } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { NoEntityFoundError } from "../../query/errors"
import { entityFromRpcResult } from "../../utils/entities"

export async function getEntity(client: ArkivClient, key: Hex) {
  // Normalize the key into bytes
  let bytes: Uint8Array
  try {
    bytes = hexToBytes(key)
  } catch {
    throw new Error(`Invalid key format: ${key}. Key must be a valid hex string.`)
  }

  if (bytes.length !== 32) {
    throw new Error(
      `Invalid key length: ${bytes.length} bytes. Key must be 32 bytes (64 hex characters) long.`,
    )
  }

  const hexKey = bytesToHex(bytes)

  const result = await client.request({
    method: "arkiv_query",
    params: [`$key = ${hexKey}`],
  })

  if (!result.data) {
    throw new NoEntityFoundError()
  }

  return entityFromRpcResult(result.data[0])
}
