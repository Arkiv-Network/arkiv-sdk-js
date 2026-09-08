import type { Account, Chain, Client, Hash, TransactionReceipt, Transport } from "viem"
import type {
  BuildMutationOptions,
  BuildMutationReturnType,
} from "../../actions/advanced/buildMutation"
import { buildMutation } from "../../actions/advanced/buildMutation"
import type {
  GetMutationResultReturnType,
  MutationResult,
} from "../../actions/advanced/getMutationResult"
import { decodeMutationResult, getMutationResult } from "../../actions/advanced/getMutationResult"
import type { PingTransactionReturnType } from "../../actions/advanced/pingTransaction"
import { pingTransaction } from "../../actions/advanced/pingTransaction"
import type {
  SendMutationOptions,
  SendMutationReturnType,
} from "../../actions/advanced/sendMutation"
import { sendMutation } from "../../actions/advanced/sendMutation"
import type { EntityMutationOps } from "../../utils/arkivTransactions"

/**
 * The read-only half of the advanced path — checking on a transaction and decoding its result —
 * which needs no account, so a Public Client carries it too.
 *
 * Every action here costs at most one RPC call, and says exactly which.
 */
export type PublicAdvancedActions = {
  /**
   * Asks the chain — once — whether a transaction has landed. Exactly one
   * `eth_getTransactionReceipt`, never a poll: an unmined transaction comes back as
   * `{ status: "pending" }` and the schedule stays yours.
   *
   * @param txHash - The transaction hash returned by `sendMutation` (or any other send)
   * @returns `{ status: "pending" }`, or `{ status: "success" | "reverted", blockNumber }`
   *
   * @example
   * const { status } = await client.advanced.pingTransaction(txHash)
   * if (status === "pending") scheduleAnotherPing()
   */
  pingTransaction: (txHash: Hash) => Promise<PingTransactionReturnType>

  /**
   * Fetches a transaction's receipt — once — and decodes what the mutation did: created keys and
   * expiries, plus the keys of everything patched, deleted, extended or handed over. One
   * `eth_getTransactionReceipt`; `{ status: "pending" }` if not mined yet. No revert diagnosis is
   * run on a `reverted` result — that extra call is yours to spend or skip.
   *
   * @param txHash - The transaction hash
   * @returns The decoded {@link MutationResult}, or `{ status: "pending" }`
   *
   * @example
   * const result = await client.advanced.getMutationResult(txHash)
   * if (result.status === "success") console.log(result.createdEntities)
   */
  getMutationResult: (txHash: Hash) => Promise<GetMutationResultReturnType>

  /**
   * Decodes a receipt you already hold into a {@link MutationResult}. **Zero RPC calls** — for
   * receipts that reached you through your own `waitForTransactionReceipt`, a block watcher, or a
   * webhook.
   *
   * @param receipt - The transaction receipt
   * @returns The decoded {@link MutationResult}
   */
  decodeMutationResult: (receipt: TransactionReceipt) => MutationResult
}

/**
 * The advanced path on a Wallet Client: build, send, ping and read results as separate steps, each
 * costing the minimum number of RPC calls — down to one per transaction when you supply what the
 * SDK would otherwise look up.
 *
 * The everyday actions (`createEntity`, `executeBatch`, …) bundle send + wait + decode and are
 * the right default. This namespace unbundles them for callers optimising their RPC budget.
 *
 * @example Minimal-call flow: one send, one ping, done.
 * const { txHash } = await client.advanced.sendMutation(
 *   { creates: [{ payload, contentType: "application/json", expires }] },
 *   { currentBlock, txParams: { nonce, gas: 1_000_000n, maxFeePerGas, maxPriorityFeePerGas } },
 * ) // exactly 1 RPC call: eth_sendRawTransaction
 * // ... later, on your own schedule:
 * const result = await client.advanced.getMutationResult(txHash) // 1 RPC call
 * if (result.status === "success") console.log(result.createdEntities)
 */
export type WalletAdvancedActions = PublicAdvancedActions & {
  /**
   * Encodes a mutation batch without sending anything: zero RPC calls with `currentBlock` supplied
   * (or when no expiry is relative), at most one `eth_blockNumber` otherwise. Returns the
   * operations for `writeContract`, and the `{ to, data }` calldata for offline signing.
   *
   * @param data - The batch (creates, patches, deletes, extensions, ownershipChanges)
   * @param options - Optional `currentBlock` to avoid the `eth_blockNumber` lookup
   */
  buildMutation: (
    data: EntityMutationOps,
    options?: BuildMutationOptions,
  ) => Promise<BuildMutationReturnType>

  /**
   * Signs and sends a mutation batch, returning the hash as soon as the transaction is submitted —
   * no waiting, no polling, no revert diagnosis. With `currentBlock` and full `txParams` (nonce,
   * gas, fees) supplied this is exactly one `eth_sendRawTransaction`; each omitted piece adds only
   * the lookup viem needs to fill it.
   *
   * @param data - The batch (creates, patches, deletes, extensions, ownershipChanges)
   * @param options - Optional `currentBlock` and `txParams`
   * @returns The transaction hash and the batch's per-kind operation counts
   *
   * @example
   * const { txHash } = await client.advanced.sendMutation({
   *   creates: [{ payload, contentType: "application/json", expires: ExpirationTime.atBlock(1_200_000n) }],
   * })
   */
  sendMutation: (
    data: EntityMutationOps,
    options?: SendMutationOptions,
  ) => Promise<SendMutationReturnType>
}

export function publicAdvancedActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>): PublicAdvancedActions {
  return {
    pingTransaction: (txHash: Hash) => pingTransaction(client, txHash),
    getMutationResult: (txHash: Hash) => getMutationResult(client, txHash),
    decodeMutationResult: (receipt: TransactionReceipt) => decodeMutationResult(receipt),
  }
}

export function walletAdvancedActions<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>): WalletAdvancedActions {
  return {
    ...publicAdvancedActions(client),
    buildMutation: (data: EntityMutationOps, options?: BuildMutationOptions) =>
      buildMutation(client, data, options),
    sendMutation: (data: EntityMutationOps, options?: SendMutationOptions) =>
      sendMutation(client, data, options),
  }
}
