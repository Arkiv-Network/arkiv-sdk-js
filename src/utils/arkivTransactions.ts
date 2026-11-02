import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  decodeEventLog,
  type Hex,
  parseAbi,
  TransactionExecutionError,
  type TransactionReceipt,
} from "viem"
import { estimateContractGas, getTransaction } from "viem/actions"
import { getAction } from "viem/utils"
import type { ChangeOwnershipParameters } from "../actions/wallet/changeOwnership"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import type { DeleteEntityParameters } from "../actions/wallet/deleteEntity"
import type { ExtendEntityParameters } from "../actions/wallet/extendEntity"
import type { PatchEntityParameters } from "../actions/wallet/patchEntity"
import type { ArkivClient } from "../clients/baseClient"
import type { WalletArkivClient } from "../clients/createWalletClient"
import { ARKIV_ADDRESS, GAS_HEADROOM_PERCENT, MAX_TRANSACTION_GAS } from "../consts"
import { ENTITY_EVENTS_ABI } from "../entity/events"
import { resolveExpiry } from "../entity/expiry"
import { encodeCreationFlags } from "../entity/flags"
import { randomSalt, resolveSalt } from "../entity/key"
import {
  createOperation,
  deleteOperation,
  EXECUTE_ABI as EXECUTE_FUNCTION_ABI,
  extendExpiryOperation,
  type Operation,
  patchOperation,
  transferOwnershipOperation,
} from "../entity/operations"
import { EmptyPatchError, EntityMutationError } from "../errors"
// Internal seam: the ABI encoders are not part of the package's public surface.
import { encodeCreate, encodePatch } from "../schema/attributes"
import type { TxParams } from "../types"

import { getLogger } from "./logger"
import { describeEntityRevert } from "./revert"

const logger = getLogger("utils:arkiv-transactions")

const ENTITY_ERRORS_ABI = parseAbi([
  // Batch and operation framing.
  "error EmptyBatch()",
  "error InvalidOpType(uint8 operation)",
  "error NonCanonicalOperationData(uint8 operation)",
  // The attribute triple list, structural.
  "error AttributesNotSorted()",
  "error TooManyAttributes(uint256 count, uint256 maxCount)",
  "error EmptyMutations(bytes32 entityKey)",
  "error TombstoneInCreate(bytes32 name)",
  "error TombstoneValueNotEmpty(bytes32 name)",
  "error SystemAttributeNotWritable(bytes32 name)",
  "error InvalidValueType(bytes32 name, uint8 typeId)",
  // Attribute-name validation. `Ident32` is a bytes32 on the wire.
  "error Ident32Empty()",
  "error Ident32InvalidByte(uint256 position, bytes1 value)",
  // Entity state and authorisation.
  "error EntityNotFound(bytes32 entityKey)",
  "error EntityExpired(bytes32 entityKey, uint64 expiresAt)",
  "error NotOwner(bytes32 entityKey, address caller, address owner)",
  "error ReadOnlyEntity(bytes32 entityKey)",
  "error ReservedCreationFlags(uint8 creationFlags)",
  // Expiry. The uint64 width of the field bounds it on the wire (the SDK's MAX_EXPIRES_AT), and the
  // chain caps how far ahead of the current block it may land, so nothing lives forever.
  "error ExpiryDeadOnArrival(uint64 target, uint64 currentBlock)",
  "error ExpiryBeyondMaxLifetime(uint64 target, uint64 currentBlock, uint64 maxLifetime)",
  "error ExpiryNotExtended(bytes32 entityKey, uint64 newExpiresAt, uint64 currentExpiresAt)",
  // Ownership transfer.
  "error TransferToZeroAddress(bytes32 entityKey)",
  "error TransferToSelf(bytes32 entityKey)",
])

const EXECUTE_ABI = [...EXECUTE_FUNCTION_ABI, ...ENTITY_ERRORS_ABI]

export type SendArkivTransactionResult = {
  receipt: TransactionReceipt
  /** The keys the engine minted for the entities this transaction created, in batch order. */
  createdEntityKeys: Hex[]
  /** The block each created entity expires at, as the engine recorded it, in the same order. */
  createdExpiries: bigint[]
  /** The block each extended entity now expires at, as the engine recorded it, in batch order. */
  extendedExpiries: bigint[]
}

export async function sendArkivTransaction(
  client: ArkivClient,
  ops: {
    creates?: readonly CreateEntityParameters[] | undefined
    patches?: readonly PatchEntityParameters[] | undefined
    deletes?: readonly DeleteEntityParameters[] | undefined
    extensions?: readonly ExtendEntityParameters[] | undefined
    ownershipChanges?: readonly ChangeOwnershipParameters[] | undefined
  },
  txParams?: TxParams,
): Promise<SendArkivTransactionResult> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  const { creates, patches, deletes, extensions, ownershipChanges } = ops

  // Every write is checked against its schema before the block read, so one that does not fit
  // fails without touching the network — and a network failure cannot mask it.
  const encodedCreates = (creates ?? []).map((item) => ({
    item,
    attributes: encodeCreate(item.schema, item.values),
  }))

  const patchOps = (patches ?? []).map((item) => {
    const mutations = encodePatch(item.schema, item)
    if (mutations.length === 0) {
      throw new EmptyPatchError(item.entityKey)
    }
    return patchOperation({ entityKey: item.entityKey, mutations })
  })

  // The block height, to resolve any relative expiry — which both creates and extensions carry.
  // Skipped entirely for a batch with neither.
  const currentBlock =
    creates?.length || extensions?.length ? await walletClient.getBlockNumber() : 0n

  const expiryContext = { currentBlock }

  const createOps = encodedCreates.map(({ item, attributes }) => {
    const salt = item.salt === undefined ? randomSalt() : resolveSalt(item.salt)
    const expiry = resolveExpiry(item.expiration, expiryContext)

    return createOperation({
      salt,
      expiry,
      creationFlags: encodeCreationFlags(item.flags),
      attributes,
    })
  })

  // An extension resolves its expiry exactly as a create does — the engine applies the same
  // `max(expiresAt, currentBlock + minLifetime)` to both — so the same bounds are checked here
  // rather than left to a revert.
  const extendOps = (extensions ?? []).map((item) => {
    const expiry = resolveExpiry(item.expiration, expiryContext)
    return extendExpiryOperation({ entityKey: item.entityKey, expiry })
  })

  const operations: Operation[] = [
    ...createOps,
    ...patchOps,
    ...(deletes ?? []).map((item) => deleteOperation({ entityKey: item.entityKey })),
    ...extendOps,
    ...(ownershipChanges ?? []).map((item) =>
      transferOwnershipOperation({
        entityKey: item.entityKey,
        newOwner: item.newOwner as Address,
      }),
    ),
  ]

  if (operations.length === 0) {
    throw new Error("No operations to perform")
  }

  logger("Sending execute with %d operations %o", operations.length, operations)

  let txHash: Hex | undefined

  try {
    const gas =
      txParams?.gas ??
      withHeadroom(
        await estimateContractGas(walletClient, {
          address: ARKIV_ADDRESS,
          abi: EXECUTE_ABI,
          functionName: "execute",
          args: [operations],
          // A local account makes viem estimate twice, the second time capped at the first result,
          // which fails if a block lands in between. This is also how viem's `writeContract` does
          // it by default if you don't pass a custom gas limit
          account: { address: client.account.address, type: "json-rpc" },
          ...txParams,
        }),
      )

    txHash = await walletClient.writeContract({
      address: ARKIV_ADDRESS,
      abi: EXECUTE_ABI,
      functionName: "execute",
      args: [operations],
      account: client.account,
      chain: client.chain,
      ...txParams,
      gas,
    })

    const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash })
    logger("Tx receipt %o", receipt)

    if (receipt.status === "reverted") {
      // There is no guarantee that the limit we estimated here
      // was the actual limit used (for example a user may
      // have overwritten it in the wallet UI)
      const actualLimitUsed = (await getGasLimitOfTx(walletClient, txHash)) ?? gas

      // No need to run a simulation if we ran out of gas
      // (simulations dont have a gas limit so it would come back as an empty error response)
      if (receipt.gasUsed >= actualLimitUsed) {
        const estimated = txParams?.gas === undefined && actualLimitUsed === gas
        throw new EntityMutationError(
          `Transaction ${receipt.transactionHash} ran out of gas: it used all ${actualLimitUsed} gas it ` +
            "was given, so nothing was applied and the fee was spent. " +
            (estimated
              ? "The batch cost more when it ran than when it was estimated, because the state " +
                "changed in between. Send it again."
              : "The limit was set rather than estimated (passed as `gas`, or changed in the " +
                "wallet) and was too low for the batch. Send it again with a higher `gas`, or " +
                "without one to let the SDK estimate it."),
          { txHash: receipt.transactionHash },
        )
      }

      try {
        await walletClient.simulateContract({
          address: ARKIV_ADDRESS,
          abi: EXECUTE_ABI,
          functionName: "execute",
          args: [operations],
          account: client.account,
          chain: client.chain,
        })
      } catch (err) {
        const error = err as { shortMessage?: string; cause?: { details?: string } }
        const reason =
          describeEntityRevert(err) ??
          error.shortMessage ??
          error.cause?.details ??
          "No reason provided by backend."
        throw new EntityMutationError(
          `Transaction ${receipt.transactionHash} reverted. Reason: ${reason}`,
          { cause: err, txHash: receipt.transactionHash },
        )
      }
      throw new EntityMutationError(
        `Transaction ${receipt.transactionHash} reverted. No reason provided by backend.`,
        { txHash: receipt.transactionHash },
      )
    }

    return {
      receipt,
      ...readAppliedOperations(receipt, {
        creates: createOps.length,
        extensions: extendOps.length,
      }),
    }
  } catch (error) {
    const described = error instanceof EntityMutationError ? undefined : describeEntityRevert(error)
    if (described !== undefined) {
      throw new EntityMutationError(`Transaction failed: ${described}`, { cause: error, txHash })
    }

    let message = "Transaction failed"
    if (error instanceof TransactionExecutionError) {
      message += `: ${error.details}`
    } else if (error instanceof ContractFunctionExecutionError) {
      logger("Contract function execution error data:", error.shortMessage)
      if (error.cause instanceof ContractFunctionRevertedError) {
        message += `: ${error.cause.message}`
      } else {
        message += ": Execution error without revert data"
      }
    } else if (error instanceof EntityMutationError) {
      throw error
    } else if (error instanceof Error) {
      message += `: ${error.message}`
    }

    throw new EntityMutationError(message, { cause: error, txHash })
  }
}

/** The gas limit a sent transaction carried, or `undefined` if the node cannot say. */
async function getGasLimitOfTx(client: WalletArkivClient, hash: Hex): Promise<bigint | undefined> {
  try {
    return (await getAction(client, getTransaction, "getTransaction")({ hash })).gas
  } catch {
    return undefined
  }
}

/**
 * An estimate with {@link GAS_HEADROOM_PERCENT} added: room for the state to change between the
 * estimate and the block the transaction lands in. Capped at {@link MAX_TRANSACTION_GAS}, so the
 * headroom alone never makes a batch too big to send, but never below the estimate itself.
 */
function withHeadroom(estimate: bigint): bigint {
  // Already too big to send: padding cannot help, so leave the estimate as it is.
  if (estimate > MAX_TRANSACTION_GAS) return estimate

  const padded = (estimate * (100n + GAS_HEADROOM_PERCENT)) / 100n

  if (padded > MAX_TRANSACTION_GAS) return MAX_TRANSACTION_GAS

  return padded
}

/**
 * The keys and expiries the engine recorded, read back from the events the batch emitted.
 */
function readAppliedOperations(
  receipt: TransactionReceipt,
  expected: { creates: number; extensions: number },
): Omit<SendArkivTransactionResult, "receipt"> {
  const createdEntityKeys: Hex[] = []
  const createdExpiries: bigint[] = []
  const extendedExpiries: bigint[] = []

  // `?? []` so a receipt without logs is reported by the count check below, which explains what is
  // missing and that the write succeeded, rather than as a TypeError from this loop.
  for (const log of receipt.logs ?? []) {
    // Only the operation address emits these, and a batch's transaction can carry logs from
    // anything else it touched.
    if (log.address.toLowerCase() !== ARKIV_ADDRESS.toLowerCase()) continue
    const decoded = decodeEntityLog(log)
    if (decoded === undefined) continue

    if (decoded.eventName === "EntityCreated") {
      createdEntityKeys.push(decoded.args.entityKey)
      createdExpiries.push(decoded.args.expiresAt)
    } else if (decoded.eventName === "ExpiryExtended") {
      extendedExpiries.push(decoded.args.expiresAt)
    }
  }

  // Operations apply in batch order and emit one event each, and creates lead the batch — so these
  // arrive already aligned with the parameters they came from. A count that disagrees means that
  // assumption broke, and a misaligned array would hand back a key belonging to another entity.
  assertCount(receipt, "create", createdEntityKeys.length, expected.creates)
  assertCount(receipt, "extension", extendedExpiries.length, expected.extensions)

  return { createdEntityKeys, createdExpiries, extendedExpiries }
}

/** One log as an entity event, or `undefined` for anything this SDK has no name for. */
function decodeEntityLog(log: TransactionReceipt["logs"][number]) {
  try {
    return decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: log.topics, data: log.data })
  } catch {
    // An event a newer engine emits and this ABI does not describe. Not this function's business.
    return undefined
  }
}

function assertCount(receipt: TransactionReceipt, what: string, got: number, want: number): void {
  if (got === want) return
  // Deliberately explicit that the write succeeded: this throws *after* a successful transaction,
  // and a caller who reads it as a failure and retries would create the entities a second time.
  throw new EntityMutationError(
    `Transaction ${receipt.transactionHash} succeeded — do not retry it — but emitted ${got} ` +
      `${what} event(s) for ${want} ${what} operation(s). The batch was applied; the SDK cannot ` +
      `say which entity each operation produced, so read them back to find them.`,
    { txHash: receipt.transactionHash },
  )
}
