import type { Hex } from "viem"
import type { ResolvedCreationFlags } from "../entity/flags"
import type { AttributeSchema, Attributes } from "../schema"

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
  /** Attribute names, types and indexing, with no values. */
  attributeSchema?: AttributeSchema | undefined
  /** Attribute names, types and values. */
  attributes?: Attributes | undefined
}

/**
 * An entity as the node returns it, decoded: the fields a query selected, with its attributes as a
 * map keyed by name. Which fields are populated is decided by the selection, so each may be
 * `undefined`.
 *
 * Queries do not return these: `select()`, `query()` and `getEntity()` lay each one out as a flat
 * row — the selected entity fields and attributes side by side, typed by the selection and, through
 * a schema, by its columns.
 */
export class Entity implements EntityFields {
  key: Hex | undefined
  owner: Hex | undefined
  creator: Hex | undefined
  createdAt: bigint | undefined
  updatedAt: bigint | undefined
  expiresAt: bigint | undefined
  creationFlags: ResolvedCreationFlags | undefined
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
    this.attributeSchema = fields.attributeSchema
    this.attributes = fields.attributes
  }
}
