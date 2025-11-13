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
    params: [
      `$key = ${hexKey}`,
      {
        includeData: {
          key: true,
          attributes: true,
          payload: true,
          contentType: true,
          expiration: true,
          owner: true,
          createdAtBlock: true,
          lastModifiedAtBlock: true,
          transactionIndexInBlock: true,
          operationIndexInTransaction: true,
        },
      },
    ],
  })

  if (!result.data) {
    throw new NoEntityFoundError()
  }

  return entityFromRpcResult(result.data[0])
}
