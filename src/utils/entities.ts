import { checksumAddress, type Hex, hexToBytes } from "viem"
import type { AttributeSchema, Attributes } from "../attr"
// Internal seam: the JSON-RPC decoder is not part of the package's public surface.
import { asTypeTag, decodeRpcValue } from "../attr/codec"
import {
  decodeCreationFlags,
  encodeCreationFlags,
  type ResolvedCreationFlags,
} from "../entity/flags"
import { Entity, type EntityFields } from "../types/entity"
import type { RpcEntity } from "../types/rpcSchema"
import { getLogger } from "./logger"

const logger = getLogger("utils:entities")

/**
 * Turns the attribute array a query returns into a name-keyed map of typed values.
 *
 * Attribute names are unique per entity, so the map loses nothing and gives callers
 * `entity.attributes.level.value` instead of a linear search.
 */
function decodeAttributes(rpcAttributes: NonNullable<RpcEntity["attributes"]>): Attributes {
  const attributes: Record<string, ReturnType<typeof decodeRpcValue>> = {}
  for (const { name, type, value } of rpcAttributes) {
    attributes[name] = decodeRpcValue(type, value)
  }
  return attributes
}

/** The same, for the values-free `attributeSchema` projection. */
function decodeSchema(entries: NonNullable<RpcEntity["attributeSchema"]>): AttributeSchema {
  const schema: Record<string, ReturnType<typeof asTypeTag>> = {}
  for (const { name, type } of entries) {
    schema[name] = asTypeTag(type)
  }
  return schema
}

/**
 * Builds an {@link Entity} from a query result row.
 *
 * A field the query did not select is absent from the response and stays `undefined` here — the
 * decoder never substitutes an empty value for one that was not asked for.
 */
export function entityFromRpcResult(rpcEntity: RpcEntity): Entity {
  logger("entityFromRpcResult %o", rpcEntity)

  const fields: EntityFields = {
    key: rpcEntity.key,
    owner: toAddress(rpcEntity.owner),
    creator: toAddress(rpcEntity.creator),
    createdAt: toBlock(rpcEntity.createdAt),
    updatedAt: toBlock(rpcEntity.updatedAt),
    expiresAt: toBlock(rpcEntity.expiresAt),
    creationFlags: decodeFlags(rpcEntity.creationFlags),
    contentType: rpcEntity.contentType,
    payload: rpcEntity.payload !== undefined ? hexToBytes(rpcEntity.payload) : undefined,
    attributeSchema:
      rpcEntity.attributeSchema !== undefined ? decodeSchema(rpcEntity.attributeSchema) : undefined,
    attributes:
      rpcEntity.attributes !== undefined ? decodeAttributes(rpcEntity.attributes) : undefined,
  }

  return new Entity(fields)
}

function toBlock(value: string | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value)
}

function toAddress(value: Hex | undefined): Hex | undefined {
  if (value === undefined) return undefined
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    logger("unreadable address %o", value)
    return value
  }
  return checksumAddress(value)
}

/**
 * Resolves the `creationFlags` projection, preferring the byte.
 */
function decodeFlags(
  value: NonNullable<RpcEntity["creationFlags"]> | undefined,
): ResolvedCreationFlags | undefined {
  if (value === undefined) return undefined

  const raw = toFlagsByte(typeof value === "number" ? value : value.raw)
  if (raw !== undefined) return decodeCreationFlags(raw)

  if (
    typeof value === "object" &&
    (value.readonly ?? value.permissionlessExtension) !== undefined
  ) {
    return decodeCreationFlags(
      encodeCreationFlags({
        readonly: value.readonly ?? false,
        permissionlessExtension: value.permissionlessExtension ?? false,
      }),
    )
  }

  logger("unreadable creationFlags %o", value)
  return undefined
}

/**
 * A flags byte in whichever spelling arrived: a JSON number, or the `0x` QUANTITY that every other
 * numeric field on {@link RpcEntity} already uses. `undefined` for anything that is not a byte.
 */
function toFlagsByte(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xff ? parsed : undefined
}
