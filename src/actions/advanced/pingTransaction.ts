import type { Hash } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { getLogger } from "../../utils/logger"
import { fetchReceipt } from "./getMutationResult"

const logger = getLogger("actions:advanced:ping-transaction")

/** Return type for {@link pingTransaction}. */
export type PingTransactionReturnType =
  | {
      /** Not mined yet (or unknown to this node). Ping again later. */
      status: "pending"
      blockNumber?: undefined
    }
  | {
      /** Mined. `success` means the whole batch applied; `reverted` means none of it did. */
      status: "success" | "reverted"
      /** The block the transaction landed in. */
      blockNumber: bigint
    }

/**
 * Asks the chain — once — whether a transaction has landed.
 *
 * Exactly one `eth_getTransactionReceipt`, never a poll: a transaction that is not mined yet comes
 * back as `{ status: "pending" }` rather than being waited on. This is the "ping" of the advanced
 * path — you own the schedule, the SDK owns nothing.
 *
 * When it reports `success` and you need the created keys or recorded expiries, spend the next
 * call on `getMutationResult` — or none at all, if you predicted the keys up front with
 * `predictEntityKeys`.
 */
export async function pingTransaction(
  client: ArkivClient,
  txHash: Hash,
): Promise<PingTransactionReturnType> {
  const receipt = await fetchReceipt(client, txHash)
  if (receipt === undefined) {
    logger("Tx %s still pending", txHash)
    return { status: "pending" }
  }
  return { status: receipt.status, blockNumber: receipt.blockNumber }
}
