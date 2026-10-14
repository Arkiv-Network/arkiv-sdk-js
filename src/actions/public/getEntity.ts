import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { NoEntityFoundError } from "../../errors"
import { runQuery } from "../../query/engine"
import { eq } from "../../query/expression"
import {
  type FullEntity,
  type FullRow,
  projectSchema,
  toRow,
  toRpcSelect,
} from "../../query/selection"
import { isSchema, key, type Schema, SchemaDefinitionError } from "../../schema"
import type { Entity } from "../../types/entity"

/**
 * Reads one entity by key, with every field selected.
 *
 * Returns a {@link FullEntity} rather than an {@link Entity}: the selection is fixed at `"*"`, so
 * every field is populated and none of them needs a `?` at the call site. The bare `Entity` type
 * has every field optional because a `select()` result carries only what it asked for.
 *
 * Given a schema, it reads the entity through it instead — as a {@link FullRow}, every entity field
 * and every column, each column checked against its declared type, and a named schema's tag
 * checked against its name.
 *
 * @throws {InvalidValueError} If the key is not 32 bytes.
 * @throws {NoEntityFoundError} If no live entity has that key — it never existed, or it was
 * deleted or has expired.
 * @throws {SchemaMismatchError} If, given a schema, the entity does not fit it.
 */
export async function getEntity(client: ArkivClient, entityKey: Hex): Promise<FullEntity>
export async function getEntity<S extends Schema>(
  client: ArkivClient,
  entityKey: Hex,
  schema: S,
): Promise<FullRow<S>>
export async function getEntity(
  client: ArkivClient,
  entityKey: Hex,
  schema?: Schema,
): Promise<FullEntity | FullRow<Schema>> {
  if (schema !== undefined && !isSchema(schema)) {
    throw new SchemaDefinitionError("getEntity() takes a schema built with defineSchema(...)")
  }
  const projection = schema === undefined ? undefined : projectSchema("*", schema)
  const { entities } = await runQuery(client, {
    query: eq("$key", key(entityKey)).toString(),
    select: projection?.select ?? toRpcSelect("*"),
    limit: 1,
  })

  const entity = entities[0]
  if (entity === undefined) {
    throw new NoEntityFoundError(entityKey)
  }
  if (projection !== undefined) return toRow(entity, projection) as FullRow<Schema>
  // Every field was selected, so the runtime Entity carries them all; the cast is the same
  // narrowing `client.select("*")` gets from its own inference.
  return entity as unknown as FullEntity
}
