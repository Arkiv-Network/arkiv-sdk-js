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
> = Pick<
  PublicActions<transport, chain, account>,
  "waitForTransactionReceipt" | "call" | "simulateContract" | "readContract" | "getBlockNumber"
> &
  Pick<
    WalletActions<chain, account>,
    | "addChain"
    | "sendCalls"
    | "waitForCallsStatus"
    | "sendTransaction"
    | "sendRawTransaction"
    | "signMessage"
    | "signTransaction"
    | "writeContract"
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
     * @throws {InvalidExpiryError} If the expiry exceeds a protocol bound or would leave the
     * entity dead on arrival.
     * @throws {InvalidValueError} If an attribute value does not fit the type it names.
     * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
     *
     * @example
     * import { createWalletClient, ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
     * import { i32 } from "@arkiv-network/sdk/attr"
     * import { braga } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { entityKey, txHash, expiresAt } = await client.createEntity({
     *   payload: jsonToPayload({ entityType: "testType", entityId: "testId" }),
     *   contentType: "application/json",
     *   attributes: { testKey: "testValue", level: i32(3) },
     *   expires: ExpirationTime.fromDays(30),
     * })
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
     * @throws {InvalidExpiryError} If `expiresIn` is not a positive integer
     * of seconds.
     * @throws {InvalidAttributeError} If a numeric attribute value is not an
     * integer.
     *
     * @example
     * import { createWalletClient } from "@arkiv-network/sdk"
     * import { braga } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
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
     * import { createWalletClient } from "@arkiv-network/sdk"
     * import { braga } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * // entityKey is the bytes32 key returned by createEntity.
     * const { txHash } = await client.deleteEntity({ entityKey })
     */
    deleteEntity: (
      data: DeleteEntityParameters,
      txParams?: TxParams,
    ) => Promise<DeleteEntityReturnType>

    /**
     * Sets a new expiry on the entity with the given key.
     *
     * The new lifetime is resolved the same way a create's is: a duration counts from now rather
     * than adding to what the entity has left, and `atBlock` / `atDate` pin an absolute deadline.
     * The engine rejects an extension that would not move the expiry later.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/extendEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity key and its new lifetime
     * @param txParams - Optional transaction parameters
     * @returns The entity key, transaction hash, and the block it is now expected to expire at
     *
     * @throws {InvalidExpiryError} If the expiry is malformed, exceeds a protocol bound, or would
     * leave the entity dead on arrival.
     *
     * @example
     * import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
     * import { braga } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { txHash, expiresAt } = await client.extendEntity({
     *   entityKey,
     *   expires: ExpirationTime.fromDays(30),
     * })
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
     * Every operation lands in one transaction, so the whole batch applies or none of it does.
     * At least one operation is required.
     *
     * @param data - The mutation parameters (creates, updates, deletes, extensions, ownershipChanges)
     * @param txParams - Optional transaction parameters
     * @returns The mutation result with transaction hash
     *
     * @throws {InvalidExpiryError} If an expiry exceeds a protocol bound or would leave the entity
     * dead on arrival.
     * @throws {InvalidValueError} If an attribute value does not fit the type it names.
     *
     * @example
     * import { createWalletClient, ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
     * import { braga } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     *
     * const client = createWalletClient({
     *   chain: braga,
     *   transport: http(),
     * })
     * const { txHash, createdEntities } = await client.mutateEntities({
     *   creates: [{
     *     payload: jsonToPayload({ entityType: "testType", entityId: "testId" }),
     *     contentType: "application/json",
     *     attributes: { testKey: "testValue" },
     *     expires: ExpirationTime.fromDays(30),
     *   }],
     *   deletes: [{ entityKey: staleKey }],
     *   extensions: [{
     *     entityKey: keyToKeepAlive,
     *     expires: ExpirationTime.atBlock(1_200_000n),
     *   }],
     *   ownershipChanges: [{ entityKey: keyToHandOver, newOwner }],
     * })
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
