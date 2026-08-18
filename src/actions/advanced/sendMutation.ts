import type { Hash } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { TxParams } from "../../types"
import { type EntityMutationOps, submitMutation } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"
import {
  type BuildMutationOptions,
  type BuildMutationReturnType,
  buildMutation,
} from "./buildMutation"

const logger = getLogger("actions:advanced:send-mutation")

/** Options for {@link sendMutation}. */
export type SendMutationOptions = BuildMutationOptions & {
  /**
   * Transaction parameters. Supply `nonce`, `gas` and the fee fields and viem has nothing left to
   * look up — the send collapses to a single `eth_sendRawTransaction`.
   */
  txParams?: TxParams
}

/** Return type for {@link sendMutation}. */
export type SendMutationReturnType = {
  /** The transaction hash. Poll it with `pingTransaction` / fetch it with `getMutationResult`. */
  txHash: Hash
  /** The per-kind operation counts of the batch that was sent, for cross-checking the result. */
  expected: BuildMutationReturnType["expected"]
}

/**
 * Signs and sends a mutation batch, returning as soon as the transaction is submitted.
 *
 * The fire-and-forget half of the advanced path. Unlike `mutateEntities`, this does **not** wait
 * for a receipt, does not poll, and runs no revert diagnosis — it spends only what submitting
 * costs. With `options.currentBlock` and full `txParams` (nonce, gas, fees) that is exactly one
 * RPC call; each omitted piece adds only the lookup viem needs to fill it.
 *
 * Follow up separately, on your own schedule:
 * - `pingTransaction(txHash)` — one `eth_getTransactionReceipt`, tells you pending/success/reverted.
 * - `getMutationResult(txHash)` — the same single call, plus the decoded entity keys and expiries.
 *
 * @throws {EntityMutationError} If the node rejects the submission (the batch never made it into
 * the mempool) — in engine terms when the rejection decodes, with the node's message otherwise.
 * Anything after that — inclusion, success — is yours to check.
 */
export async function sendMutation(
  client: ArkivClient,
  data: EntityMutationOps,
  options: SendMutationOptions = {},
): Promise<SendMutationReturnType> {
  const { operations, expected } = await buildMutation(client, data, options)

  logger("Sending execute with %d operations (no wait)", operations.length)

  const txHash = await submitMutation(client, operations, options.txParams)

  return { txHash, expected }
}
