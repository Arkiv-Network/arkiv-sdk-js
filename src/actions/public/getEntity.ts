import type { Hex } from "viem"
import { key } from "../../attr"
import type { ArkivClient } from "../../clients/baseClient"
import { NoEntityFoundError } from "../../errors"
import { runQuery } from "../../query/engine"
import { eq } from "../../query/expression"
import { type FullEntity, toRpcSelect } from "../../query/selection"

/**
 * Reads one entity by key, with every field selected.
 *
 * Returns a {@link FullEntity} rather than an {@link Entity}: the selection is fixed at `"*"`, so
 * every field is populated and none of them needs a `?` at the call site. The bare `Entity` type
 * has every field optional because a `select()` result carries only what it asked for.
 *
 * @throws {InvalidValueError} If the key is not 32 bytes.
 * @throws {NoEntityFoundError} If no live entity has that key — it never existed, or it was
 * deleted or has expired.
 */
export async function getEntity(client: ArkivClient, entityKey: Hex): Promise<FullEntity> {
  const { entities } = await runQuery(client, {
    query: eq("$key", key(entityKey)).toString(),
    select: toRpcSelect("*"),
    limit: 1,
  })

  const entity = entities[0]
  if (entity === undefined) {
    throw new NoEntityFoundError(entityKey)
  }
  // Every field was selected, so the runtime Entity carries them all; the cast is the same
  // narrowing `client.select("*")` gets from its own inference.
  return entity as unknown as FullEntity
}
