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
     * @returns The new entity's key, the transaction hash, and the block it is expected to
     * expire at. {@link CreateEntityReturnType}
     *
     * @throws {InvalidExpiryError} If the expiry exceeds a protocol bound or would leave the
     * entity dead on arrival.
     * @throws {InvalidValueError} If an attribute value does not fit the type it names.
     * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
     *
     * @example
     * import { createWalletClient, ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
     * import { i32 } from "@arkiv-network/sdk/attr"
     * import { cheesecake } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: cheesecake,
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
     * Applies a patch to the entity with the given key: sets some fields, unsets others, and leaves
     * everything it does not name alone.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/patchEntity
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The entity key and the mutations to apply
     * @param txParams - Optional transaction parameters
     * @returns The patched entity's key and the transaction hash. {@link PatchEntityReturnType}
     *
     * @throws {EmptyPatchError} If the patch has nothing to apply.
     * @throws {ConflictingMutationError} If a name appears in both `set` and `unset`.
     * @throws {InvalidValueError} If an attribute value does not fit the type it names.
     * @throws {InvalidAttributeNameError} If a name violates the attribute-name grammar.
     *
     * @example
     * import { createWalletClient, jsonToPayload } from "@arkiv-network/sdk"
     * import { i32 } from "@arkiv-network/sdk/attr"
     * import { cheesecake } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: cheesecake,
     *   transport: http(),
     * })
     * // Publish the entity: one attribute changes, one goes away, the payload is replaced.
     * const { txHash } = await client.patchEntity({
     *   entityKey,
     *   set: { status: "published", revision: i32(2) },
     *   unset: ["draft"],
     *   payload: jsonToPayload({ title: "Hello" }),
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
     * @returns The deleted entity's key and the transaction hash. {@link DeleteEntityReturnType}
     *
     * @example
     * import { createWalletClient } from "@arkiv-network/sdk"
     * import { cheesecake } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: cheesecake,
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
     * @returns The entity's key, the transaction hash, and the block it is now expected to expire
     * at. {@link ExtendEntityReturnType}
     *
     * @throws {InvalidExpiryError} If the expiry is malformed, exceeds a protocol bound, or would
     * leave the entity dead on arrival.
     *
     * @example
     * import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
     * import { cheesecake } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: cheesecake,
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
     * Hands the entity with the given key to a new owner.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/changeOwnership
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * @param data - The ownership change parameters
     * @param txParams - Optional transaction parameters
     * @returns The entity's key and the transaction hash. {@link ChangeOwnershipReturnType}
     */
    changeOwnership: (
      data: ChangeOwnershipParameters,
      txParams?: TxParams,
    ) => Promise<ChangeOwnershipReturnType>

    /**
     * Applies a batch of entity operations — creates, patches, deletes, extensions and ownership
     * transfers — in one transaction.
     *
     * - Docs: https://docs.arkiv.network/ts-sdk/actions/wallet/mutateEntities
     * - JSON-RPC Methods: [`eth_sendRawTransaction`](https://docs.arkiv.network/dev/json-rpc-api/#mutateEntities)
     *
     * Every operation lands in one transaction, so the whole batch applies or none of it does.
     * At least one operation is required.
     *
     * @param data - The mutation parameters (creates, patches, deletes, extensions, ownershipChanges)
     * @param txParams - Optional transaction parameters
     * @returns The transaction hash, plus the keys touched by each kind of operation.
     * {@link MutateEntitiesReturnType}
     *
     * @throws {InvalidExpiryError} If an expiry exceeds a protocol bound or would leave the entity
     * dead on arrival.
     * @throws {InvalidValueError} If an attribute value does not fit the type it names.
     *
     * @example
     * import { createWalletClient, ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
     * import { cheesecake } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: cheesecake,
     *   transport: http(),
     * })
     * const { txHash, createdEntities } = await client.mutateEntities({
     *   creates: [{
     *     payload: jsonToPayload({ entityType: "testType", entityId: "testId" }),
     *     contentType: "application/json",
     *     attributes: { testKey: "testValue" },
     *     expires: ExpirationTime.fromDays(30),
     *   }],
     *   patches: [{ entityKey: keyToRevise, set: { status: "archived" }, unset: ["draft"] }],
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
