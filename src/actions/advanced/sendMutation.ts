import type { Hash } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { WalletArkivClient } from "../../clients/createWalletClient"
import { ARKIV_ADDRESS } from "../../consts"
import { EXECUTE_ABI } from "../../entity/operations"
import { EntityMutationError } from "../../errors"
import type { TxParams } from "../../types"
import { ENTITY_ERRORS_ABI, type EntityMutationOps } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"
import { describeEntityRevert } from "../../utils/revert"
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
 * the mempool). Anything after that — inclusion, success — is yours to check.
 */
export async function sendMutation(
  client: ArkivClient,
  data: EntityMutationOps,
  options: SendMutationOptions = {},
): Promise<SendMutationReturnType> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  const { operations, expected } = await buildMutation(client, data, options)

  logger("Sending execute with %d operations (no wait)", operations.length)

  try {
    const txHash = await walletClient.writeContract({
      address: ARKIV_ADDRESS,
      abi: [...EXECUTE_ABI, ...ENTITY_ERRORS_ABI],
      functionName: "execute",
      args: [operations],
      account: client.account,
      chain: client.chain,
      ...options.txParams,
    })

    return { txHash, expected }
  } catch (error) {
    // Decoding the node's rejection is free — no extra RPC — so the one failure this call can see
    // is still reported in engine terms.
    const described = describeEntityRevert(error)
    if (described !== undefined) {
      throw new EntityMutationError(`Transaction failed: ${described}`, { cause: error })
    }
    throw error
  }
}
