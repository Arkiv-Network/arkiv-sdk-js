import type { Account, Chain, Client, Hex, PublicActions, Transport, WalletActions } from "viem"
import type {
  ChangeOwnershipParameters,
  ChangeOwnershipReturnType,
} from "../../actions/wallet/changeOwnership"
import { changeOwnership } from "../../actions/wallet/changeOwnership"
import {
  type CreateEntityOptions,
  type CreateEntityReturnType,
  createEntity,
} from "../../actions/wallet/createEntity"
import type {
  DeleteEntityParameters,
  DeleteEntityReturnType,
} from "../../actions/wallet/deleteEntity"
import { deleteEntity } from "../../actions/wallet/deleteEntity"
import type {
  ExecuteBatchParameters,
  ExecuteBatchReturnType,
} from "../../actions/wallet/executeBatch"
import { executeBatch } from "../../actions/wallet/executeBatch"
import type {
  ExtendEntityParameters,
  ExtendEntityReturnType,
} from "../../actions/wallet/extendEntity"
import { extendEntity } from "../../actions/wallet/extendEntity"
import {
  type PatchEntityChanges,
  type PatchEntityReturnType,
  patchEntity,
} from "../../actions/wallet/patchEntity"
import type { CreateEntityValues, Schema } from "../../schema"
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
     * Creates a new entity through a schema: each column becomes an attribute, written with the
     * type and indexed flag the schema declares.
     *
     * - JSON-RPC Methods: `eth_sendRawTransaction`
     *
     * @param schema - The schema the entity is written through, built with `defineSchema`.
     * @param values - The entity's values, keyed by column. Required columns must be given;
     * defaulted ones left out are written with their default. {@link CreateEntityValues}
     * @param options - The entity's lifetime, plus its flags and salt. {@link CreateEntityOptions}
     * @param txParams - Optional transaction parameters
     * @returns The new entity's key, the transaction hash, and the block it is expected to
     * expire at. {@link CreateEntityReturnType}
     *
     * @throws {InvalidExpiryError} If the expiry exceeds a protocol bound or would leave the
     * entity dead on arrival.
     * @throws {SchemaMismatchError} If the values do not fit the schema.
     * @throws {InvalidValueError} If a value does not fit its type.
     *
     * @example
     * import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
     * import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
     * import { tiramisu } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const Posts = defineSchema("posts", {
     *   author:   addr().indexed(),
     *   category: str().indexed(),
     *   score:    dec().indexed(),
     *   title:    str(),
     *   body:     bytes(),
     *   mimeType: str().default("text/markdown"),
     * })
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: tiramisu,
     *   transport: http(),
     * })
     * const { entityKey, txHash, expiresAt } = await client.createEntity(
     *   Posts,
     *   {
     *     author: addr(client.account.address),
     *     category: "docs",
     *     score: dec("4.1"),
     *     title: "Cells, not entities",
     *     body: new TextEncoder().encode("# Hello"),
     *   },
     *   { expires: ExpirationTime.fromDays(30) },
     * )
     */
    createEntity: <S extends Schema>(
      schema: S,
      values: CreateEntityValues<S>,
      options: CreateEntityOptions,
      txParams?: TxParams,
    ) => Promise<CreateEntityReturnType>

    /**
     * Patches the entity with the given key through a schema: sets some columns, unsets optional
     * ones, and leaves everything it does not name alone.
     *
     * - JSON-RPC Methods: `eth_sendRawTransaction`
     *
     * @param schema - The schema the changes are typed by.
     * @param entityKey - The entity to patch.
     * @param changes - The columns to set and the optional columns to unset. {@link PatchEntityChanges}
     * @param txParams - Optional transaction parameters
     * @returns The patched entity's key and the transaction hash. {@link PatchEntityReturnType}
     *
     * @throws {EmptyPatchError} If the patch has nothing to apply.
     * @throws {ConflictingMutationError} If a name appears in both `set` and `unset`.
     * @throws {SchemaMismatchError} If the changes do not fit the schema.
     * @throws {InvalidValueError} If a value does not fit its type.
     *
     * @example
     * // One column changes, an optional one goes away.
     * const { txHash } = await client.patchEntity(Posts, entityKey, {
     *   set: { score: dec("4.5") },
     *   unset: ["thumbnail"],
     * })
     */
    patchEntity: <S extends Schema>(
      schema: S,
      entityKey: Hex,
      changes: PatchEntityChanges<S>,
      txParams?: TxParams,
    ) => Promise<PatchEntityReturnType>

    /**
     * Deletes the entity with the given key.
     *
     * - JSON-RPC Methods: `eth_sendRawTransaction`
     *
     * @param data - The entity deletion parameters
     * @param txParams - Optional transaction parameters
     * @returns The deleted entity's key and the transaction hash. {@link DeleteEntityReturnType}
     *
     * @example
     * import { createWalletClient } from "@arkiv-network/sdk"
     * import { tiramisu } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: tiramisu,
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
     * - JSON-RPC Methods: `eth_sendRawTransaction`
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
     * import { tiramisu } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: tiramisu,
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
     * - JSON-RPC Methods: `eth_sendRawTransaction`
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
     * - JSON-RPC Methods: `eth_sendRawTransaction`
     *
     * Every operation lands in one transaction, so the whole batch applies or none of it does.
     * At least one operation is required. Each create and patch names its own schema and is typed
     * by it, so one batch can write entities of several schemas.
     *
     * @param data - The batch parameters (creates, patches, deletes, extensions, ownershipChanges)
     * @param txParams - Optional transaction parameters
     * @returns The transaction hash, plus the keys touched by each kind of operation.
     * {@link ExecuteBatchReturnType}
     *
     * @throws {InvalidExpiryError} If an expiry exceeds a protocol bound or would leave the entity
     * dead on arrival.
     * @throws {SchemaMismatchError} If a create's or patch's values do not fit its schema.
     * @throws {InvalidValueError} If a value does not fit its type.
     *
     * @example
     * import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
     * import { tiramisu } from "@arkiv-network/sdk/chains"
     * import { http } from "viem"
     * import { privateKeyToAccount } from "viem/accounts"
     *
     * const client = createWalletClient({
     *   account: privateKeyToAccount("0x..."),
     *   chain: tiramisu,
     *   transport: http(),
     * })
     * const { txHash, createdEntities } = await client.executeBatch({
     *   creates: [{
     *     schema: Posts,
     *     values: { author, category: "docs", score: dec("4.1"), title: "Hi", body: new Uint8Array() },
     *     expires: ExpirationTime.fromDays(30),
     *   }],
     *   patches: [{ schema: Posts, entityKey: keyToRevise, set: { category: "archive" } }],
     *   deletes: [{ entityKey: staleKey }],
     *   extensions: [{
     *     entityKey: keyToKeepAlive,
     *     expires: ExpirationTime.atBlock(1_200_000n),
     *   }],
     *   ownershipChanges: [{ entityKey: keyToHandOver, newOwner }],
     * })
     */
    executeBatch: <
      const TCreates extends readonly Schema[] = [],
      const TPatches extends readonly Schema[] = [],
    >(
      data: ExecuteBatchParameters<TCreates, TPatches>,
      txParams?: TxParams,
    ) => Promise<ExecuteBatchReturnType>
  }

export function walletArkivActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
  return {
    createEntity: <S extends Schema>(
      schema: S,
      values: CreateEntityValues<S>,
      options: CreateEntityOptions,
      txParams?: TxParams,
    ) => createEntity(client, schema, values, options, txParams),
    patchEntity: <S extends Schema>(
      schema: S,
      entityKey: Hex,
      changes: PatchEntityChanges<S>,
      txParams?: TxParams,
    ) => patchEntity(client, schema, entityKey, changes, txParams),
    deleteEntity: (data: DeleteEntityParameters, txParams?: TxParams) =>
      deleteEntity(client, data, txParams),
    extendEntity: (data: ExtendEntityParameters, txParams?: TxParams) =>
      extendEntity(client, data, txParams),
    changeOwnership: (data: ChangeOwnershipParameters, txParams?: TxParams) =>
      changeOwnership(client, data, txParams),
    executeBatch: <
      const TCreates extends readonly Schema[] = [],
      const TPatches extends readonly Schema[] = [],
    >(
      data: ExecuteBatchParameters<TCreates, TPatches>,
      txParams?: TxParams,
    ) => executeBatch(client, data, txParams),
  }
}
