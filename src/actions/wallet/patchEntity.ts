import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { OptionalColumnName, PatchEntityValues, Schema } from "../../schema"
import type { TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:patch-entity")

/**
 * What a patch changes.
 *
 * A patch names only what changes. Columns it does not mention keep whatever value they have — so
 * a caller can change one column without first reading the entity to learn what the others are,
 * and without racing anyone else who is changing a different one.
 *
 * @typeParam S - The schema the changes are typed by.
 *
 * @example
 * { set: { title: "Cells, not entities", score: dec("4.2") }, unset: ["thumbnail"] }
 */
export type PatchEntityChanges<S extends Schema = Schema> = {
  /**
   * Columns to write, keyed by name. Each is written with the indexed flag its column declares,
   * so writing a column whose indexing the schema has since changed changes it on the entity too.
   * Defaults do not apply: a patch writes only what it names.
   *
   * @throws {SchemaMismatchError} If a name is not a column, or a value is not of its column's type.
   */
  set?: PatchEntityValues<S> | undefined
  /**
   * Optional columns to remove. Naming one the entity does not carry is not an error — the outcome
   * is the same either way, and a caller clearing a column should not have to know whether it was
   * ever set.
   *
   * @throws {ConflictingMutationError} If a name also appears in `set`.
   */
  unset?: readonly OptionalColumnName<S>[] | undefined
}

/**
 * One patch, as a batch carries it: the schema, the entity, and the {@link PatchEntityChanges}.
 *
 * The entity's identity is fixed: a patch never moves the key, the owner, the creation flags or the
 * expiry. Use `extendEntity` for the expiry and `changeOwnership` for the owner.
 */
export type PatchEntityParameters<S extends Schema = Schema> = PatchEntityChanges<S> & {
  /** The schema the changes are typed by. */
  schema: S
  /** The entity to patch. */
  entityKey: Hex
}

/** The result of a patch. */
export type PatchEntityReturnType = {
  /** The patched entity's key — unchanged, since a patch never moves it. */
  entityKey: Hex
  txHash: Hash
}

export async function patchEntity<S extends Schema>(
  client: ArkivClient,
  schema: S,
  entityKey: Hex,
  changes: PatchEntityChanges<S>,
  txParams?: TxParams,
): Promise<PatchEntityReturnType> {
  logger("patchEntity %s %o", entityKey, changes)
  const { receipt } = await sendArkivTransaction(
    client,
    { patches: [{ ...changes, schema, entityKey }] },
    txParams,
  )

  logger("Receipt from patchEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey,
  }
}
