import type { Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { NoEntityFoundError } from "../../errors"
import { runQuery } from "../../query/engine"
import { eq } from "../../query/expression"
import { type FullEntity, type FullRow, projectSelection, toRow } from "../../query/selection"
import { isSchema, key, type Schema, SchemaDefinitionError } from "../../schema"

/**
 * Reads one entity by key, with every field selected.
 *
 * The same as `select("*")`: a {@link FullEntity} — every entity field, every attribute as the
 * `attributes` map, and the `attributeSchema` — with none of them needing a `?` at the call site.
 *
 * Given a schema, it reads the entity through it instead, as `select("*").from(schema)` would — a
 * {@link FullRow}, every entity field and every column, each column checked against its declared
 * type, and a named schema's tag checked against its name.
 *
 * @throws {InvalidValueError} If the key is not 32 bytes.
 * @throws {NoEntityFoundError} If no live entity has that key — it never existed, or it was
 * deleted or has expired.
 * @throws {SchemaMismatchError} If, given a schema, the entity does not fit it.
 * @throws {SchemaDefinitionError} If the schema given was not built with `defineSchema`.
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
  const projection = projectSelection("*", schema)
  const { entities } = await runQuery(client, {
    query: eq("$key", key(entityKey)).toString(),
    select: projection.select,
    limit: 1,
  })

  const entity = entities[0]
  if (entity === undefined) {
    throw new NoEntityFoundError(entityKey)
  }
  // Every field was selected, so the row carries them all; the cast is the same narrowing
  // `client.select("*")` gets from its own inference.
  return toRow(entity, projection) as FullEntity | FullRow<Schema>
}
