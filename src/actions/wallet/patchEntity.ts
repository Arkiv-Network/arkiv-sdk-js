import type { Hash, Hex } from "viem"
import type { AttributeInputs } from "../../attr"
import type { ArkivClient } from "../../clients/baseClient"
import type { MimeType, TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:patch-entity")

/**
 * Parameters for patching an entity.
 *
 * A patch names only what changes. Attributes it does not mention keep whatever value they have, and
 * the payload and content type stay as they are unless given — so a caller can change one field
 * without first reading the entity to learn what the others are, and without racing anyone else who
 * is changing a different field.
 *
 * The entity's identity is fixed: a patch never moves the key, the owner, the creation flags or the
 * expiry. Use `extendEntity` for the expiry and `changeOwnership` for the owner.
 *
 * @example Change one attribute and remove another, leaving the payload alone:
 * await client.patchEntity({
 *   entityKey,
 *   set: { status: "published", level: i32(11) },
 *   unset: ["draft"],
 * })
 *
 * @example Replace the contents without touching a single attribute:
 * await client.patchEntity({
 *   entityKey,
 *   payload: jsonToPayload({ hello: "again" }),
 * })
 */
export type PatchEntityParameters = {
  /** The entity to patch. */
  entityKey: Hex
  /**
   * Attributes to write, keyed by name. An existing attribute is overwritten — including with a
   * different type — and a name the entity does not carry yet is added.
   *
   * Values are the tagged constructors from `@arkiv-network/sdk/attr` — `i32`, `u256`, `dec`, `str`,
   * `addr`, `key`, `bytes32`, `bool` — or a bare `boolean`, `number`, `bigint` or `string` where the
   * type is unambiguous.
   *
   * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
   * @throws {InvalidValueError} If a value does not fit the type it names or defaults to.
   */
  set?: AttributeInputs | undefined
  /**
   * Attribute names to remove. Naming one the entity does not carry is not an error — the outcome
   * is the same either way, and a caller clearing a field should not have to know whether it was
   * ever set.
   *
   * @throws {ConflictingMutationError} If a name also appears in `set`.
   */
  unset?: readonly string[] | undefined
  /**
   * The entity's new payload. Omit it to leave the current contents untouched; pass an empty
   * `Uint8Array` to replace them with nothing.
   */
  payload?: Uint8Array | undefined
  /**
   * The payload's new MIME type. Omit it to keep the current one — which is what you want when the
   * new payload is the same kind of thing as the old.
   */
  contentType?: MimeType | (string & {}) | undefined
}

/** The result of patching an entity. */
export type PatchEntityReturnType = {
  /** The patched entity's key — unchanged, since a patch never moves it. */
  entityKey: Hex
  txHash: Hash
}

export async function patchEntity(
  client: ArkivClient,
  data: PatchEntityParameters,
  txParams?: TxParams,
): Promise<PatchEntityReturnType> {
  logger("patchEntity %o", data)
  const { receipt } = await sendArkivTransaction(client, { patches: [data] }, txParams)

  logger("Receipt from patchEntity %o", receipt)

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey: data.entityKey,
  }
}
