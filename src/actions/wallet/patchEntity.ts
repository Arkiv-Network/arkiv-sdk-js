import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { BLOCK_TIME } from "../../consts"
import { CannotPreserveExpirationError, UnsafeNumericAttributeError } from "../../errors"
import type { Attribute, MimeType, TxParams } from "../../types"
import { getLogger } from "../../utils/logger"
import { type GetBlockTimingReturnType, getBlockTiming } from "../public/getBlockTiming"
import { getEntity } from "../public/getEntity"
import { type UpdateEntityParameters, updateEntity } from "./updateEntity"

const logger = getLogger("actions:wallet:patch-entity")

/**
 * An attribute in a patch (key/value pair). Unlike {@link Attribute}, the
 * value may also be `null`, which removes the attribute from the entity
 * instead of setting a value.
 *
 * Arkiv stores string and numeric attributes separately, so the same key may
 * exist with both a string and a numeric value. A patch entry only replaces
 * the existing attribute of the same value type; a `null` value removes both
 * the string and the numeric attribute with that key. If a patch contains
 * several entries with the same key and value type, the last one wins.
 *
 * Non-null values follow the same rules as {@link Attribute}: numeric values
 * **must be integers** (scale non-integers, e.g. `1.5` -> `1500`, or use a
 * string). A non-integer numeric value throws an {@link InvalidAttributeError}.
 */
export type PatchAttribute = {
  key: string
  /** Attribute value, or `null` to remove the attribute from the entity.
   * A `number` must be an integer (scale non-integers, e.g. `1.5` -> `1500`, or
   * use a string). Throws {@link InvalidAttributeError} otherwise. */
  value: Attribute["value"] | null
}

/**
 * Parameters for the patchEntity function. Every field except entityKey is
 * optional — omitted fields keep the entity's current value.
 * - entityKey: The key of the entity to patch.
 * - payload: The new payload of the entity. If omitted, the current payload
 *   is kept.
 * - attributes: Attributes to merge into the entity's current attributes.
 *   Attributes with new keys are appended; if a key already exists on the
 *   entity with the same value type, its value is replaced; a value of `null`
 *   removes both the string and the numeric attribute with that key. Existing
 *   attributes not listed here are kept untouched. Attribute values may be
 *   strings or numbers, but numeric values **must be integers**. To store a
 *   non-integer, scale it to an integer (e.g. `1.5` -> `1500`) to preserve
 *   numeric ordering, or pass it as a string (e.g. `"1.5"`). A non-integer
 *   numeric value throws an {@link InvalidAttributeError}.
 * - contentType: The new content type of the entity. If omitted, the current
 *   content type is kept.
 * - expiresIn: How long until the entity expires, in seconds. If omitted, the
 *   entity's remaining lifetime is preserved as measured when the entity is
 *   read back: each such patch can lengthen the lifetime by the blocks mined
 *   until the update lands on chain, so pass expiresIn explicitly when the
 *   exact expiration matters. Because Arkiv measures expiration in blocks
 *   (1 block = 2 seconds), this **must be a positive integer and a multiple
 *   of the block time (2 seconds)**. Invalid values throw an
 *   {@link InvalidExpirationError}.
 */
export type PatchEntityParameters = {
  entityKey: Hex
  /** New payload. If omitted, the current payload is kept. */
  payload?: Uint8Array
  /** Attributes to merge with the entity's current attributes: new keys are appended,
   * existing keys with the same value type have their value replaced, a `null` value
   * removes both the string and the numeric attribute with that key, other attributes
   * are kept. Numeric values must be integers (scale non-integers, e.g. `1.5` -> `1500`,
   * or use a string). Throws {@link InvalidAttributeError} otherwise. */
  attributes?: PatchAttribute[]
  /** New content type. If omitted, the current content type is kept. */
  contentType?: MimeType | string
  /** Seconds until expiry. If omitted, the entity's remaining lifetime is preserved
   * as measured at read time — each such patch can lengthen the lifetime by the
   * blocks mined until the update lands, so pass expiresIn explicitly when the exact
   * expiration matters. Must be a positive integer and a multiple of the 2s block
   * time. Throws {@link InvalidExpirationError} otherwise. */
  expiresIn?: number
}

/**
 * Return type for the patchEntity function.
 * - entityKey: The key of the entity.
 * - txHash: The transaction hash.
 */
export type PatchEntityReturnType = {
  entityKey: Hex
  txHash: Hash
}

// String and numeric attributes live in separate spaces on chain, so patch
// entries are indexed by (value type, key), not by key alone.
function typedKey(type: "string" | "number", key: string): string {
  return `${type}\0${key}`
}

/**
 * Indexes patch entries by (value type, key). Later entries win over earlier
 * ones with the same key and value type; a `null` value masks the key in both
 * type spaces (a `null` entry maps to `null`, meaning removal).
 */
function patchToOps(patch: PatchAttribute[]): Map<string, Attribute | null> {
  const ops = new Map<string, Attribute | null>()
  for (const { key, value } of patch) {
    if (value === null) {
      ops.set(typedKey("string", key), null)
      ops.set(typedKey("number", key), null)
    } else {
      ops.set(typedKey(typeof value === "number" ? "number" : "string", key), { key, value })
    }
  }
  return ops
}

function mergeAttributes(existing: Attribute[], patch: PatchAttribute[]): Attribute[] {
  const ops = patchToOps(patch)
  return [
    ...existing.filter(
      (attribute) =>
        !ops.has(
          typedKey(typeof attribute.value === "number" ? "number" : "string", attribute.key),
        ),
    ),
    ...[...ops.values()].filter((attribute): attribute is Attribute => attribute !== null),
  ]
}

function applyPatchToUpdate(
  base: UpdateEntityParameters,
  patch: PatchEntityParameters,
): UpdateEntityParameters {
  return {
    entityKey: base.entityKey,
    payload: patch.payload ?? base.payload,
    attributes: patch.attributes
      ? mergeAttributes(base.attributes, patch.attributes)
      : base.attributes,
    contentType: patch.contentType ?? base.contentType,
    expiresIn: patch.expiresIn ?? base.expiresIn,
  }
}

/**
 * Resolves an ordered list of patches targeting the **same entity** into full
 * update parameters: the entity's current state is fetched once and the
 * patches are applied on top of it in order, each one seeing the previous
 * one's changes.
 *
 * When no patch sets expiresIn, the entity's remaining lifetime is computed
 * from the current block (taken from blockTiming, which callers resolving
 * several entities can fetch once and share; fetched from the client when not
 * provided), so the resulting expiration matches the entity's current one up
 * to the blocks mined until the update transaction lands.
 */
export async function resolvePatchEntities(
  client: ArkivClient,
  patches: PatchEntityParameters[],
  blockTiming?: GetBlockTimingReturnType,
): Promise<UpdateEntityParameters> {
  const [{ entityKey }] = patches
  const entity = await getEntity(client, entityKey)

  // Numeric attributes are parsed with Number() when the entity is read back,
  // so values above Number.MAX_SAFE_INTEGER may have lost precision and
  // writing them back would silently corrupt them on chain. Refuse unless the
  // patch overwrites or removes the affected attribute.
  const ops = patchToOps(patches.flatMap((patch) => patch.attributes ?? []))
  for (const attribute of entity.attributes) {
    if (
      typeof attribute.value === "number" &&
      !Number.isSafeInteger(attribute.value) &&
      !ops.has(typedKey("number", attribute.key))
    ) {
      throw new UnsafeNumericAttributeError(entityKey, attribute.key, attribute.value)
    }
  }

  // the last patch that sets expiresIn wins; if none does, preserve the
  // entity's remaining lifetime as measured now
  let expiresIn: number | undefined
  for (const patch of patches) {
    expiresIn = patch.expiresIn ?? expiresIn
  }
  if (expiresIn === undefined) {
    if (entity.expiresAtBlock === undefined) {
      throw new CannotPreserveExpirationError(entityKey, "it has no expiration block.")
    }
    const { currentBlock } = blockTiming ?? (await getBlockTiming(client))
    const remainingBlocks = entity.expiresAtBlock - currentBlock
    if (remainingBlocks <= 0n) {
      throw new CannotPreserveExpirationError(entityKey, "it has already expired.")
    }
    expiresIn = Number(remainingBlocks) * BLOCK_TIME
  }

  let update: UpdateEntityParameters = {
    entityKey,
    payload: entity.payload ?? new Uint8Array(),
    attributes: entity.attributes,
    contentType: entity.contentType ?? "",
    expiresIn,
  }
  for (const patch of patches) {
    update = applyPatchToUpdate(update, patch)
  }
  return update
}

/**
 * Resolves a patch into full update parameters by fetching the entity's
 * current state and overlaying the provided fields onto it.
 *
 * When expiresIn is omitted, the entity's remaining lifetime is computed from
 * the current block, so the resulting expiration matches the entity's current
 * one (up to the blocks mined until the update transaction lands).
 */
export async function resolvePatchEntity(
  client: ArkivClient,
  data: PatchEntityParameters,
): Promise<UpdateEntityParameters> {
  return await resolvePatchEntities(client, [data])
}

/**
 * Resolves a list of patches, possibly targeting different entities, into
 * full updates. Patches for the same entity key are grouped and applied in
 * order, folding into a single update per entity so that none of them
 * clobbers another. Block timing is fetched at most once, and only when a
 * group needs it to preserve an entity's remaining lifetime.
 */
export async function resolvePatches(
  client: ArkivClient,
  patches: PatchEntityParameters[],
): Promise<UpdateEntityParameters[]> {
  const groups = new Map<Hex, PatchEntityParameters[]>()
  for (const patch of patches) {
    const group = groups.get(patch.entityKey)
    if (group) group.push(patch)
    else groups.set(patch.entityKey, [patch])
  }

  const needsBlockTiming = [...groups.values()].some((group) =>
    group.every((patch) => patch.expiresIn === undefined),
  )
  const blockTiming = needsBlockTiming ? await getBlockTiming(client) : undefined

  return await Promise.all(
    [...groups.values()].map((group) => resolvePatchEntities(client, group, blockTiming)),
  )
}

/**
 * Partially updates an entity: fetches its current state, overlays the
 * provided fields onto it and sends a full update. Omitted fields keep their
 * current value; attributes are merged (appended, replaced or removed by key,
 * where a `null` value means removal) instead of replaced wholesale like in
 * updateEntity.
 *
 * **This operation is not atomic.** It reads the entity and then sends an
 * update transaction as two separate steps. If the entity is modified between
 * the read and the update landing on chain, those concurrent changes are
 * silently overwritten and lost.
 */
export async function patchEntity(
  client: ArkivClient,
  data: PatchEntityParameters,
  txParams?: TxParams,
): Promise<PatchEntityReturnType> {
  logger("patchEntity %o", data)
  const update = await resolvePatchEntity(client, data)
  return await updateEntity(client, update, txParams)
}
