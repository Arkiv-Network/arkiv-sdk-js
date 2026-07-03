import type { Account, Chain, Client, PublicActions, Transport, WalletActions } from "viem"
import type {
  ChangeOwnershipParameters,
  ChangeOwnershipReturnType,
} from "../../actions/wallet/changeOwnership"
import { changeOwnership } from "../../actions/wallet/changeOwnership"
import {
  type CreateEntityParameters,
  type CreateEntityReturnType,
  createEntity,
} from "../../actions/wallet/createEntity"
import type {
  DeleteEntityParameters,
  DeleteEntityReturnType,
} from "../../actions/wallet/deleteEntity"
import { deleteEntity } from "../../actions/wallet/deleteEntity"
import type {
  ExtendEntityParameters,
  ExtendEntityReturnType,
} from "../../actions/wallet/extendEntity"
import { extendEntity } from "../../actions/wallet/extendEntity"
import type {
  MutateEntitiesParameters,
  MutateEntitiesReturnType,
} from "../../actions/wallet/mutateEntities"
import { mutateEntities } from "../../actions/wallet/mutateEntities"
import type { PatchEntityParameters, PatchEntityReturnType } from "../../actions/wallet/patchEntity"
import { patchEntity } from "../../actions/wallet/patchEntity"
import type {
  UpdateEntityParameters,
  UpdateEntityReturnType,
} from "../../actions/wallet/updateEntity"
import { updateEntity } from "../../actions/wallet/updateEntity"
import type { TxParams } from "../../types"

export type WalletArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
> = Pick<PublicActions<transport, chain, account>, "waitForTransactionReceipt" | "call"> &
  Pick<
    WalletActions<chain, account>,
    | "addChain"
    | "sendCalls"
    | "waitForCallsStatus"
    | "sendTransaction"
    | "sendRawTransaction"
    | "signMessage"
    | "signTransaction"
  > & {
    /**
     * Creates a new entity.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/createEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity creation parameters
     * @param txParams - Optional transaction parameters
     * @returns The created entity with transaction hash
     *
     * @throws {InvalidExpirationError} If `expiresIn` is not a positive integer
     * that is a multiple of the block time (2 seconds).
     * @throws {InvalidAttributeError} If a numeric attribute value is not an
     * integer.
     *
     * @example
     * import { createPublicClient, http } from 'arkiv'
     * import { braga } from 'arkiv/chains'
     *
     * const client = createPublicClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { entityKey, txHash } = await client.createEntity({
     *   payload: toBytes(JSON.stringify({ entity: { entityType: "testType", entityId: "testId" } })),
     *   attributes: [{ key: "testKey", value: "testValue" }],
     *   expiresIn: 1000,
     * })
     * console.log("entityKey", entityKey)
     * console.log("txHash", txHash)
     * // {
     * //   entityKey: "0x123",
     * //   txHash: "0x123",
     * // }
     */
    createEntity: (
      data: CreateEntityParameters,
      txParams?: TxParams,
    ) => Promise<CreateEntityReturnType>

    /**
     * Updates the entity with the given key.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/updateEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity update parameters
     * @param txParams - Optional transaction parameters
     * @returns The updated entity with transaction hash
     *
     * @throws {InvalidExpirationError} If `expiresIn` is not a positive integer
     * that is a multiple of the block time (2 seconds).
     * @throws {InvalidAttributeError} If a numeric attribute value is not an
     * integer.
     *
     * @example
     * import { createWalletClient, http } from 'arkiv'
     * import { braga } from 'arkiv/chains'
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     */
    updateEntity: (
      data: UpdateEntityParameters,
      txParams?: TxParams,
    ) => Promise<UpdateEntityReturnType>

    /**
     * Partially updates the entity with the given key. Unlike updateEntity,
     * which replaces the whole entity, patchEntity fetches the entity's
     * current state, overlays the provided fields onto it and sends a full
     * update. Omitted fields keep their current value; attributes are merged:
     * attributes with new keys are appended, attributes with existing keys of
     * the same value type (string or numeric) have their value replaced, a
     * value of `null` removes both the string and the numeric attribute with
     * that key, and the entity's other attributes are kept. If expiresIn is
     * omitted, the entity's remaining lifetime is preserved as measured at
     * read time — each such patch can lengthen the lifetime by the blocks
     * mined until the update lands on chain, so pass expiresIn explicitly
     * when the exact expiration matters.
     *
     * **This operation is not atomic.** It is syntax sugar over getEntity
     * followed by updateEntity. If the entity is modified by someone else
     * between the read and the update transaction landing on chain, those
     * concurrent changes are silently overwritten and lost.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/patchEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity patch parameters
     * @param txParams - Optional transaction parameters
     * @returns The patched entity key with transaction hash
     *
     * @throws {NoEntityFoundError} If no entity exists under the given key.
     * @throws {InvalidExpirationError} If `expiresIn` is provided and is not a
     * positive integer that is a multiple of the block time (2 seconds).
     * @throws {InvalidAttributeError} If a numeric attribute value is not an
     * integer.
     * @throws {CannotPreserveExpirationError} If `expiresIn` is omitted and
     * the entity has no expiration block or has already expired.
     * @throws {UnsafeNumericAttributeError} If an untouched numeric attribute
     * read back from the entity exceeds Number.MAX_SAFE_INTEGER and so cannot
     * be written back without risking corruption.
     *
     * @example
     * import { createWalletClient, http } from 'arkiv'
     * import { braga } from 'arkiv/chains'
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * // replaces the payload, appends/updates the "newAttr" attribute and
     * // removes the "oldAttr" attribute, keeping all other attributes, the
     * // content type and the expiration
     * const { entityKey, txHash } = await client.patchEntity({
     *   entityKey: "0x123",
     *   payload: stringToPayload("new payload"),
     *   attributes: [
     *     { key: "newAttr", value: "newVal" },
     *     { key: "oldAttr", value: null },
     *   ],
     * })
     */
    patchEntity: (
      data: PatchEntityParameters,
      txParams?: TxParams,
    ) => Promise<PatchEntityReturnType>

    /**
     * Deletes the entity with the given key.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/deleteEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity deletion parameters
     * @param txParams - Optional transaction parameters
     * @returns The deleted entity with transaction hash
     *
     * @example
     * import { createWalletClient, http } from 'arkiv'
     * import { braga } from 'arkiv/chains'
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { entityKey, txHash } = await client.deleteEntity({ entityKey: "0x123" })
     * console.log("entityKey", entityKey)
     * console.log("txHash", txHash)
     * // {
     * //   entityKey: "0x123",
     * //   txHash: "0x123",
     * // }
     */
    deleteEntity: (
      data: DeleteEntityParameters,
      txParams?: TxParams,
    ) => Promise<DeleteEntityReturnType>

    /**
     * Extends the entity with the given key.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/extendEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity update parameters
     * @param txParams - Optional transaction parameters
     * @returns The updated entity with transaction hash
     *
     * @throws {InvalidExpirationError} If `expiresIn` is not a positive integer
     * that is a multiple of the block time (2 seconds).
     *
     * @example
     * import { createWalletClient, http } from 'arkiv'
     * import { braga } from 'arkiv/chains'
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { entityKey, txHash } = await client.extendEntity("0x123", {
     *   expiresIn: 1000,
     * })
     * console.log("entityKey", entityKey)
     * console.log("txHash", txHash)
     * // {
     * //   entityKey: "0x123",
     * //   txHash: "0x123",
     * // }
     */
    extendEntity: (
      data: ExtendEntityParameters,
      txParams?: TxParams,
    ) => Promise<ExtendEntityReturnType>

    /**
     * Changes the ownership of the entity with the given address.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/changeOwnership
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The ownership change parameters
     * @param txParams - Optional transaction parameters
     * @returns The entity with updated ownership and transaction hash
     */
    changeOwnership: (
      data: ChangeOwnershipParameters,
      txParams?: TxParams,
    ) => Promise<ChangeOwnershipReturnType>

    /**
     * Mutates the entities with the given keys.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/mutateEntities
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The mutation parameters (creates, updates, patches, deletes, extensions)
     * @param txParams - Optional transaction parameters
     * @returns The mutation result with transaction hash
     *
     * Patches are resolved into full updates by fetching each entity's current
     * state first (see patchEntity); their keys are reported in
     * updatedEntities (once per entity — several patches for the same entity
     * key are applied in order and folded into a single update). **Patches
     * are not atomic**: changes made to an entity between that read and the
     * mutation transaction landing on chain are silently overwritten and lost.
     *
     * @throws {InvalidExpirationError} If any create/update/extension `expiresIn`
     * is not a positive integer that is a multiple of the block time (2 seconds).
     * @throws {InvalidAttributeError} If a numeric attribute value is not an
     * integer.
     * @throws {NoEntityFoundError} If a patch targets an entity that does not
     * exist.
     * @throws {CannotPreserveExpirationError} If a patch omits `expiresIn` and
     * the entity has no expiration block or has already expired.
     * @throws {UnsafeNumericAttributeError} If a patched entity has an
     * untouched numeric attribute above Number.MAX_SAFE_INTEGER that cannot be
     * written back without risking corruption.
     *
     * @example
     * import { createWalletClient, http } from 'arkiv'
     * import { braga } from 'arkiv/chains'
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { entityKey, txHash } = await client.mutateEntities({
     *   creates: [{
     *     payload: toBytes(JSON.stringify({ entity: { entityType: "testType", entityId: "testId" } })),
     *     attriubutes: [{ key: "testKey", value: "testValue" }],
     *     expiresIn: 1000,
     *   }],
     *   updates: [{
     *     entityKey: "0x123",
     *     payload: toBytes(JSON.stringify({ entity: { entityType: "testType", entityId: "testId" } })),
     *     attributes: [{ key: "testKey", value: "testValue" }],
     *     expiresIn: 1000,
     *   }],
     *   patches: [{
     *     entityKey: "0x456",
     *     attributes: [{ key: "newAttr", value: "newVal" }],
     *   }],
     *   deletes: [{
     *     entityKey: "0x321",
     *   }],
     *   extensions: [{
     *     entityKey: "0x1234",
     *     expiresIn: 1000,
     *   }],
     * })
     * console.log("entityKey", entityKey)
     * console.log("txHash", txHash)
     * // {
     * //   entityKey: "0x123",
     * //   txHash: "0x123",
     * // }
     */
    mutateEntities: (
      data: MutateEntitiesParameters,
      txParams?: TxParams,
    ) => Promise<MutateEntitiesReturnType>
  }

export function walletArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
  return {
    createEntity: (data: CreateEntityParameters, txParams?: TxParams) =>
      createEntity(client, data, txParams),
    updateEntity: (data: UpdateEntityParameters, txParams?: TxParams) =>
      updateEntity(client, data, txParams),
    patchEntity: (data: PatchEntityParameters, txParams?: TxParams) =>
      patchEntity(client, data, txParams),
    deleteEntity: (data: DeleteEntityParameters, txParams?: TxParams) =>
      deleteEntity(client, data, txParams),
    extendEntity: (data: ExtendEntityParameters, txParams?: TxParams) =>
      extendEntity(client, data, txParams),
    changeOwnership: (data: ChangeOwnershipParameters, txParams?: TxParams) =>
      changeOwnership(client, data, txParams),
    mutateEntities: (data: MutateEntitiesParameters, txParams?: TxParams) =>
      mutateEntities(client, data, txParams),
  }
}
