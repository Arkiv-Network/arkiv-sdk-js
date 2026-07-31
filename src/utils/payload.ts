import { stringToBytes, toBytes } from "viem"

export function jsonToPayload(json: object): Uint8Array {
  return toBytes(JSON.stringify(json))
}

export function stringToPayload(data: string): Uint8Array {
  // stringToBytes, not toBytes: toBytes hex-decodes hex-looking strings, which
  // would corrupt payloads like "0xab" instead of UTF-8 encoding them
  return stringToBytes(data)
}
