import { stringToBytes, toBytes } from "viem"

/**
 * A JSON-serialisable value as an entity payload — `JSON.stringify` then UTF-8.
 *
 * Pair it with `contentType: "application/json"`, which is what lets `entity.toJson()` read it back.
 *
 * @example
 * await client.createEntity({
 *   payload: jsonToPayload({ hello: "world" }),
 *   contentType: "application/json",
 *   expires: ExpirationTime.fromDays(30),
 * })
 */
export function jsonToPayload(json: object): Uint8Array {
  return toBytes(JSON.stringify(json))
}

/**
 * A string as an entity payload, encoded as UTF-8.
 *
 * Hex-looking text is encoded as text: `stringToPayload("0xab")` gives the four bytes of that
 * string, not the single byte `0xab`. Read it back with `entity.toText()`.
 *
 * @example
 * await client.createEntity({
 *   payload: stringToPayload("hello"),
 *   contentType: "text/plain",
 *   expires: ExpirationTime.fromDays(30),
 * })
 */
export function stringToPayload(data: string): Uint8Array {
  // stringToBytes, not toBytes: toBytes hex-decodes hex-looking strings, which
  // would corrupt payloads like "0xab" instead of UTF-8 encoding them
  return stringToBytes(data)
}
