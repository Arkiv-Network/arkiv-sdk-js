import { bytesToString, type Hex } from "viem"
import type { MimeType } from "../types"
import type { Attribute } from "./attributes"

export class Entity {
  key: Hex
  contentType: MimeType | undefined
  owner: Hex | undefined
  creator: Hex | undefined
  expiresAtBlock: bigint | undefined
  createdAtBlock: bigint | undefined
  lastModifiedAtBlock: bigint | undefined
  transactionIndexInBlock: bigint | undefined
  operationIndexInTransaction: bigint | undefined
  payload: Uint8Array | undefined
  attributes: Attribute[]

  constructor(
    key: Hex,
    contentType: MimeType | undefined = undefined,
    owner: Hex | undefined = undefined,
    creator: Hex | undefined = undefined,
    expiresAtBlock: bigint | undefined = undefined,
    createdAtBlock: bigint | undefined = undefined,
    lastModifiedAtBlock: bigint | undefined = undefined,
    transactionIndexInBlock: bigint | undefined = undefined,
    operationIndexInTransaction: bigint | undefined = undefined,
    payload: Uint8Array | undefined = undefined,
    attributes: Attribute[],
  ) {
    this.key = key
    this.owner = owner
    this.creator = creator
    this.expiresAtBlock = expiresAtBlock
    this.createdAtBlock = createdAtBlock
    this.lastModifiedAtBlock = lastModifiedAtBlock
    this.transactionIndexInBlock = transactionIndexInBlock
    this.operationIndexInTransaction = operationIndexInTransaction
    this.payload = payload
    this.attributes = attributes
    this.contentType = contentType
  }

  toText(): string {
    if (this.payload === undefined) {
      throw new Error(
        "Entity has no payload - probably not added withPayload when querying for the entity",
      )
    }
    return bytesToString(this.payload)
  }

  toJson(): any {
    const text = this.toText()
    if (!text) {
      throw new Error("Entity has empty payload, cannot parse as JSON")
    }
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error("Failed to parse entity payload as JSON: " + (e instanceof Error ? e.message : String(e)))
    }
  }
}
