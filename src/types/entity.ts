import { bytesToString, type Hex } from "viem"
import type { MimeType } from "../types"
import type { Annotation } from "./annotation"

export class Entity {
  key: Hex
  owner: Hex
  expiresAtBlock: bigint
  payload: Uint8Array
  annotations: Annotation[]
  contentType: MimeType

  constructor(
    key: Hex,
    contentType: MimeType,
    owner: Hex,
    expiresAtBlock: bigint,
    payload: Uint8Array,
    annotations: Annotation[],
  ) {
    this.key = key
    this.owner = owner
    this.expiresAtBlock = expiresAtBlock
    this.payload = payload
    this.annotations = annotations
    this.contentType = contentType
  }

  toText(): string {
    return bytesToString(this.payload)
  }

  toJson(): any {
    return JSON.parse(bytesToString(this.payload))
  }
}
