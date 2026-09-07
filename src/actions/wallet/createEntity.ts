import type { Hash, Hex } from "viem"
import type { AttributeInputs } from "../../attr"
import type { ArkivClient } from "../../clients/baseClient"
import type { CreationFlags, Expiry, NO_SALT, SaltInput } from "../../entity"
import { EntityMutationError } from "../../errors"
import type { MimeType, TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import type { ExpirationTime } from "../../utils/expirationTime"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:create-entity")

/**
 * Parameters for creating an entity.
 *
 * An entity always carries contents and a type for them, plus a lifetime. Attributes, flags and a
 * salt are optional on top of that.
 *
 * @example
 * const { entityKey } = await client.createEntity({
 *   attributes: {
 *     level:   i32(10),
 *     balance: u256(1_000_000n),
 *     score:   dec("3.5"),
 *     name:    "Bob",   // bare string -> str
 *     flagged: true,    // bare boolean -> bool
 *   },
 *   payload: jsonToPayload({ hello: "world" }),
 *   contentType: "application/json",
 *   expires: ExpirationTime.fromDays(30),
 *   flags: { readonly: true },
 * })
 *
 * @example Pin an absolute deadline, but refuse to create something nearly dead:
 * await client.createEntity({
 *   payload, contentType: "application/json",
 *   expires: ExpirationTime.atDate(someDeadline, {
 *     atLeast: ExpirationTime.fromDays(1),    // ...but live at least a day regardless
 *   }),
 * })
 *
 * @example An entity that is nothing but queryable attributes still declares its (empty) contents:
 * await client.createEntity({
 *   attributes: { parent: key(parentKey), rank: i32(3) },
 *   payload: new Uint8Array(),
 *   contentType: "application/octet-stream",
 *   expires: ExpirationTime.fromDays(30),
 * })
 */
export type CreateEntityParameters = {
  /**
   * How long the entity should live, built with {@link ExpirationTime}.
   *
   * `ExpirationTime.fromDays(30)` is the everyday form. `atBlock` / `atDate` pin an absolute
   * deadline instead, and either can carry `{ atLeast }` to guarantee a minimum life on top of it.
   */
  expires: Expiry
  /**
   * The entity's opaque payload. Travels to the engine as the `$payload` system attribute; on this
   * surface it is just the entity's contents.
   *
   * Pass an empty `Uint8Array` for an entity that is nothing but queryable attributes — it is
   * written as an empty payload rather than left unset, so what you pass is what is stored.
   */
  payload: Uint8Array
  /** The payload's MIME type, e.g. `"application/json"`. Sent as the `$contentType` cell. */
  contentType: MimeType | (string & {})
  /**
   * The entity's queryable attributes, keyed by name. Values are the tagged constructors from
   * `@arkiv-network/sdk/attr` — `i32`, `u64`, `u256`, `dec`, `str`, `addr`, `key`, `bytes32`,
   * `bool` — or a bare `boolean`, `number`, `bigint` or `string` where the type is unambiguous.
   *
   * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
   * @throws {InvalidValueError} If a value does not fit the type it names or defaults to.
   */
  attributes?: AttributeInputs | undefined
  /**
   * Properties fixed at creation: `readonly` and `permissionlessExtension`. No operation changes
   * them afterwards, so an entity is whatever it was created as for life. Both default to `false`.
   */
  flags?: CreationFlags | undefined
  /**
   * The salt mixed into the entity key. Defaults to 128 random bits, which makes the key
   * unpredictable to everyone but the creator.
   *
   * Pass {@link NO_SALT} for a key derived from the owner and nonce alone — predictable by anyone,
   * which is what you want only when a third party must be able to compute the key in advance.
   */
  salt?: SaltInput | undefined
}

/**
 * The result of creating an entity.
 */
export type CreateEntityReturnType = {
  /** The new entity's key. */
  entityKey: Hex
  txHash: Hash
  /**
   * The block the entity is expected to expire at, resolved against the block the transaction was
   * built on.
   *
   * The engine resolves a duration against the block the transaction actually lands in, so for
   * `ExpirationTime.fromDays(30)` and friends this is a lower bound: the real expiry is later by
   * however many blocks passed between building and inclusion. An `atBlock` deadline is exact.
   */
  expiresAt: bigint
}

export async function createEntity(
  client: ArkivClient,
  data: CreateEntityParameters,
  txParams?: TxParams,
): Promise<CreateEntityReturnType> {
  logger("createEntity %o", data)
  const { receipt, createdEntityKeys, createdExpiries } = await sendArkivTransaction(
    client,
    { creates: [data] },
    txParams,
  )

  logger("Receipt from createEntity %o", receipt)

  const [entityKey] = createdEntityKeys
  const [expiresAt] = createdExpiries
  if (entityKey === undefined || expiresAt === undefined) {
    throw new EntityMutationError(
      `Transaction ${receipt.transactionHash} succeeded, but the receipt did not carry the expected entity key or expiry.`,
      { txHash: receipt.transactionHash },
    )
  }

  return {
    txHash: receipt.transactionHash as Hash,
    entityKey,
    expiresAt,
  }
}
