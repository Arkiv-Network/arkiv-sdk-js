import { type Hash, type Hex, type TransactionReceipt, TransactionReceiptNotFoundError } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { PublicArkivClient } from "../../clients/createPublicClient"
import { collectMutationEvents } from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:advanced:get-mutation-result")

/**
 * A mined mutation, decoded from its receipt alone.
 *
 * Everything here comes out of the events the batch emitted, so no request context is needed to
 * read it — a process that holds nothing but the transaction hash gets the full picture. Arrays
 * are in batch order, which is the order the operations were applied in.
 */
export type MutationResult = {
  /** `success` means the whole batch applied; `reverted` means none of it did (arrays are empty). */
  status: "success" | "reverted"
  /** The transaction hash. */
  txHash: Hash
  /** The block the transaction landed in. */
  blockNumber: bigint
  /** The keys the engine minted for the created entities, in batch order. */
  createdEntities: Hex[]
  /** The block each created entity expires at, as the engine recorded it, in the same order. */
  createdExpiries: bigint[]
  /** The keys of the patched entities. */
  patchedEntities: Hex[]
  /** The keys of the deleted entities. */
  deletedEntities: Hex[]
  /** The keys of the extended entities. */
  extendedEntities: Hex[]
  /** The block each extended entity now expires at, in the same order. */
  extendedExpiries: bigint[]
  /** The keys of the entities handed to a new owner. */
  ownershipChanges: Hex[]
  /** The raw receipt, so nothing the chain said is lost. */
  receipt: TransactionReceipt
}

/** Return type for {@link getMutationResult}: the decoded result, or still pending. */
export type GetMutationResultReturnType = MutationResult | { status: "pending" }

/**
 * Decodes a receipt you already hold into a {@link MutationResult}. **Zero RPC calls.**
 *
 * The pure tail of the advanced path: if a receipt reached you some other way — your own
 * `waitForTransactionReceipt`, a webhook, a block watcher — this turns it into entity keys and
 * expiries without touching the network. Lenient by design: it reports what the events say,
 * without counting them against a request it never saw.
 */
export function decodeMutationResult(receipt: TransactionReceipt): MutationResult {
  const events = collectMutationEvents(receipt.logs)
  return {
    status: receipt.status,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    createdEntities: events.created.map((e) => e.entityKey),
    createdExpiries: events.created.map((e) => e.expiresAt),
    patchedEntities: events.patched.map((e) => e.entityKey),
    deletedEntities: events.deleted.map((e) => e.entityKey),
    extendedEntities: events.extended.map((e) => e.entityKey),
    extendedExpiries: events.extended.map((e) => e.expiresAt),
    ownershipChanges: events.ownershipTransferred.map((e) => e.entityKey),
    receipt,
  }
}

/**
 * Fetches a transaction's receipt — once — and decodes what the mutation did.
 *
 * Exactly one `eth_getTransactionReceipt`, like `pingTransaction`, but the answer carries the
 * decoded entity events as well: created keys, recorded expiries, and the keys of everything
 * patched, deleted, extended or handed over. A transaction that is not mined yet comes back as
 * `{ status: "pending" }` — check `status` before reading the rest.
 *
 * No revert diagnosis is run: a `reverted` result reports the fact and the raw receipt, and
 * spending a `simulateContract` on the why is your call, not the SDK's.
 */
export async function getMutationResult(
  client: ArkivClient,
  txHash: Hash,
): Promise<GetMutationResultReturnType> {
  const receipt = await fetchReceipt(client, txHash)
  if (receipt === undefined) {
    logger("Tx %s still pending", txHash)
    return { status: "pending" }
  }
  return decodeMutationResult(receipt)
}

/**
 * One `eth_getTransactionReceipt`, with "not there yet" as a value instead of an exception.
 *
 * Internal seam shared with `pingTransaction`; not part of the package's public surface.
 */
export async function fetchReceipt(
  client: ArkivClient,
  txHash: Hash,
): Promise<TransactionReceipt | undefined> {
  // The one action this needs is on every SDK-built client — both factories extend viem's
  // `publicActions` — and `PublicArkivClient` is the type that says so, the same way
  // `sendArkivTransaction` narrows to `WalletArkivClient`.
  const reader = client as PublicArkivClient
  try {
    return await reader.getTransactionReceipt({ hash: txHash })
  } catch (error) {
    // viem models an unmined transaction as a throw; the advanced path models it as a state.
    if (error instanceof TransactionReceiptNotFoundError) return undefined
    throw error
  }
}
