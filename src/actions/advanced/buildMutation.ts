import { type Address, encodeFunctionData, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import type { PublicArkivClient } from "../../clients/createPublicClient"
import { ARKIV_ADDRESS } from "../../consts"
import { EXECUTE_ABI, type Operation } from "../../entity/operations"
import {
  buildEntityOperations,
  type EntityMutationOps,
  mutationNeedsBlockNumber,
} from "../../utils/arkivTransactions"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:advanced:build-mutation")

/** Options for the advanced-path builders ({@link buildMutation}, {@link sendMutation}). */
export type BuildMutationOptions = {
  /**
   * The chain head to resolve relative expiries against.
   *
   * Pass a block number you already hold — from a previous call, `getBlockTiming()`, or your own
   * tracking — and the build spends no RPC call at all. Without it, one `eth_blockNumber` is made,
   * and only when the batch actually needs the head (a relative lifetime or a `Date` deadline);
   * purely absolute `atBlock(n)` expiries never trigger it.
   *
   * Supplying it also buys back a check: absolute expiries are validated against it, so an
   * `atBlock(n)` already in the past throws {@link InvalidExpiryError} locally instead of
   * reverting on-chain. When the head is neither supplied nor fetched, that dead-on-arrival
   * check is skipped — the one local validation of the everyday path this path trades away.
   */
  currentBlock?: bigint
}

/** What {@link buildMutation} hands back: the batch in every form a sender might want. */
export type BuildMutationReturnType = {
  /** The encoded batch, in engine order, for `writeContract`-style sends. */
  operations: Operation[]
  /** The Arkiv engine address the transaction must be sent to. */
  to: Address
  /**
   * The full `execute(operations)` calldata. Sign a transaction carrying it offline (with your own
   * nonce, gas and fees) and the whole mutation costs exactly one `eth_sendRawTransaction`.
   */
  data: Hex
  /**
   * How many operations of each kind went into the batch — which is how many events of each kind a
   * successful transaction emits, in batch order, for cross-checking a decoded result.
   */
  expected: {
    creates: number
    patches: number
    deletes: number
    extensions: number
    ownershipChanges: number
  }
}

/**
 * Encodes a mutation batch without sending anything.
 *
 * This is the first step of the advanced path: it performs only local validation and encoding, so
 * it costs **zero RPC calls** when `options.currentBlock` is provided (or no expiry is relative),
 * and at most one `eth_blockNumber` otherwise. Send the result however you like: pass `operations`
 * to `writeContract`, or sign `{ to, data }` offline and push it with `eth_sendRawTransaction`.
 *
 * One check rides on knowing the head: an absolute `atBlock(n)` already in the past is rejected
 * locally only when the head is supplied or was fetched anyway. With neither, a dead-on-arrival
 * expiry encodes cleanly and the engine reverts it on-chain — see
 * {@link BuildMutationOptions.currentBlock}.
 *
 * @throws {InvalidExpiryError} If an expiry exceeds a protocol bound.
 * @throws {InvalidValueError} If an attribute value does not fit the type it names.
 * @throws {EmptyPatchError} If a patch has nothing to apply.
 */
export async function buildMutation(
  client: ArkivClient,
  data: EntityMutationOps,
  options: BuildMutationOptions = {},
): Promise<BuildMutationReturnType> {
  // The head is fetched only when an expiry is actually measured from it and the caller did not
  // supply one — the advanced path never spends an RPC call it can avoid.
  const currentBlock =
    options.currentBlock ??
    (mutationNeedsBlockNumber(data)
      ? // Every SDK-built client carries viem's `publicActions`; `PublicArkivClient` is the type
        // that says so, the same narrowing `sendArkivTransaction` does to `WalletArkivClient`.
        await (client as PublicArkivClient).getBlockNumber()
      : 0n)

  const operations = buildEntityOperations(data, { currentBlock })
  logger("Built %d operations at block %d", operations.length, currentBlock)

  return {
    operations,
    to: ARKIV_ADDRESS,
    data: encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [operations] }),
    expected: {
      creates: data.creates?.length ?? 0,
      patches: data.patches?.length ?? 0,
      deletes: data.deletes?.length ?? 0,
      extensions: data.extensions?.length ?? 0,
      ownershipChanges: data.ownershipChanges?.length ?? 0,
    },
  }
}
