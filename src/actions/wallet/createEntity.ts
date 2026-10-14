import type { Hash, Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { CreationFlags, Expiry, NO_SALT, SaltInput } from "../../entity"
import { EntityMutationError } from "../../errors"
import type { CreateEntityValues, Schema } from "../../schema"
import type { TxParams } from "../../types"
import { sendArkivTransaction } from "../../utils/arkivTransactions"
import type { ExpirationTime } from "../../utils/expirationTime"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:wallet:create-entity")

/**
 * How an created entity lives: its lifetime, plus the flags and salt it is created with.
 *
 * @example
 * { expires: ExpirationTime.fromDays(30) }
 *
 * @example Pin an absolute deadline, but refuse to create something nearly dead:
 * {
 *   expires: ExpirationTime.atDate(someDeadline, {
 *     atLeast: ExpirationTime.fromDays(1),    // ...but live at least a day regardless
 *   }),
 *   flags: { readonly: true },
 * }
 */
export type CreateEntityOptions = {
  /**
   * How long the entity should live, built with {@link ExpirationTime}.
   *
   * `ExpirationTime.fromDays(30)` is the everyday form. `atBlock` / `atDate` pin an absolute
   * deadline instead, and either can carry `{ atLeast }` to guarantee a minimum life on top of it.
   */
  expires: Expiry
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
 * One entity to create, as a batch carries it: the schema, the values, and the {@link CreateEntityOptions}.
 *
 * @typeParam S - The schema the values are typed by.
 */
export type CreateEntityParameters<S extends Schema = Schema> = CreateEntityOptions & {
  /** The schema the entity is written through. */
  schema: S
  /**
   * The entity's values, keyed by column. Every required column must be given; an optional one may
   * be left out, and a defaulted one left out is written with its default.
   */
  values: CreateEntityValues<S>
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

export async function createEntity<S extends Schema>(
  client: ArkivClient,
  schema: S,
  values: CreateEntityValues<S>,
  options: CreateEntityOptions,
  txParams?: TxParams,
): Promise<CreateEntityReturnType> {
  logger("createEntity %o", values)
  const { receipt, createdEntityKeys, createdExpiries } = await sendArkivTransaction(
    client,
    { creates: [{ ...options, schema, values }] },
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
