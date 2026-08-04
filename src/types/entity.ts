import { bytesToString, type Hex } from "viem"
import type { AttributeSchema, Attributes } from "../attr"
import type { ResolvedCreationFlags } from "../entity/flags"

export enum EntityOperationType {
  Create = 1,
  Update = 2,
  Extend = 3,
  Transfer = 4,
  Delete = 5,
  Expire = 6,
}

/**
 * The fields an {@link Entity} can carry. Every one is optional: a query returns exactly the parts
 * it selected, and `undefined` means "not asked for" rather than "empty".
 */
export type EntityFields = {
  key?: Hex | undefined
  owner?: Hex | undefined
  creator?: Hex | undefined
  /** Block the entity was created at. */
  createdAt?: bigint | undefined
  /** Block the entity was last patched at. */
  updatedAt?: bigint | undefined
  /** Block the entity expires at. */
  expiresAt?: bigint | undefined
  /** The immutable properties the entity was created with. */
  creationFlags?: ResolvedCreationFlags | undefined
  contentType?: string | undefined
  payload?: Uint8Array | undefined
  /** Attribute names and types, with no values. */
  attributeSchema?: AttributeSchema | undefined
  /** Attribute names, types and values. */
  attributes?: Attributes | undefined
}

/**
 * An entity as it comes back from a query.
 *
 * Which fields are populated is decided by the query's selection — `select({ key: true })` gives
 * back an entity carrying only its key. The static type of a `select()` result is narrowed to
 * exactly the selected fields, so in typed code the `undefined`s here are not reachable.
 */
export class Entity implements EntityFields {
  key: Hex | undefined
  owner: Hex | undefined
  creator: Hex | undefined
  createdAt: bigint | undefined
  updatedAt: bigint | undefined
  expiresAt: bigint | undefined
  creationFlags: ResolvedCreationFlags | undefined
  contentType: string | undefined
  payload: Uint8Array | undefined
  attributeSchema: AttributeSchema | undefined
  attributes: Attributes | undefined

  constructor(fields: EntityFields = {}) {
    this.key = fields.key
    this.owner = fields.owner
    this.creator = fields.creator
    this.createdAt = fields.createdAt
    this.updatedAt = fields.updatedAt
    this.expiresAt = fields.expiresAt
    this.creationFlags = fields.creationFlags
    this.contentType = fields.contentType
    this.payload = fields.payload
    this.attributeSchema = fields.attributeSchema
    this.attributes = fields.attributes
  }

  /**
   * The payload decoded as UTF-8 text.
   *
   * @throws If the payload was not selected, or is not valid UTF-8.
   */
  toText(): string {
    if (this.payload === undefined) {
      throw new Error(
        "Entity has no payload — the query did not select it. Use select({ payload: true }).",
      )
    }
    try {
      return bytesToString(this.payload)
    } catch (e) {
      throw new Error(
        `Failed to convert entity payload to text: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      )
    }
  }

  /**
   * The payload parsed as JSON.
   *
   * @throws If the payload was not selected, is empty, or is not valid JSON.
   */
  // biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns whatever the payload holds.
  toJson(): any {
    const text = this.toText()
    if (!text) {
      throw new Error("Entity has empty payload, cannot parse as JSON")
    }
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(
        `Failed to parse entity payload as JSON: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      )
    }
  }
}
