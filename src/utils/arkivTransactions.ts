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
import type { ChangeOwnershipParameters } from "../actions/wallet/changeOwnership"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import type { DeleteEntityParameters } from "../actions/wallet/deleteEntity"
import type { ExtendEntityParameters } from "../actions/wallet/extendEntity"
import type { PatchEntityParameters } from "../actions/wallet/patchEntity"
// Internal seam: the ABI encoders are not part of the package's public surface.
import { encodeAttributes, encodeMutations } from "../attr/attributes"
import type { ArkivClient } from "../clients/baseClient"
import type { WalletArkivClient } from "../clients/createWalletClient"
import { ARKIV_ADDRESS } from "../consts"
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
import { EmptyPatchError, EntityMutationError, InvalidContentTypeError } from "../errors"
import type { TxParams } from "../types"

import { getLogger } from "./logger"
import { describeEntityRevert } from "./revert"

const logger = getLogger("utils:arkiv-transactions")

// Define token strings and regex at module level to compile once,
// and avoid recompiling the regex on every call to the function
const token = String.raw`[!#$%&'*+\-.^_\x60{|}~0-9A-Za-z]+`
const lowercaseToken = String.raw`[!#$%&'*+\-.^_\x60{|}~0-9a-z]+`
const quotedString = String.raw`"(?:[\t !#-\[\]-~]|\\[\t -~])*"`
// parameter part MUST be with an `=` sign
const parameter = String.raw`;[ \t]*${token}[ \t]*=[ \t]*(?:${token}|${quotedString})`

const CONTENT_TYPE_MIME_REGEX = new RegExp(`^${lowercaseToken}/${lowercaseToken}(?:${parameter})*$`)

/**
 * Ensure the `content-type` string provided adheres to RFC 2045
 * (MIME Part One: Format of Internet Message Bodies).
 *
 * The media type and subtype must be lowercase to prevent `text/plain` vs
 * `Text/Plain` ambiguity. Optional parameters may use token or quoted-string
 * values and preserve their casing.
 *
 * @param contentType e.g. `application/json`, `text/plain; charset=utf-8`
 */
function validateContentType(contentType: string): void {
  if (!CONTENT_TYPE_MIME_REGEX.test(contentType)) {
    throw new InvalidContentTypeError(contentType)
  }
}

export const ENTITY_ERRORS_ABI = parseAbi([
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
  // Expiry. The engine bounds an expiry only by the width of the field and by liveness — there is
  // no MAX_EXPIRES_AT or MAX_LIFETIME, so there is no error for exceeding one.
  "error ExpiryDeadOnArrival(uint64 target, uint64 currentBlock)",
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
    creates?: CreateEntityParameters[]
    patches?: PatchEntityParameters[]
    deletes?: DeleteEntityParameters[]
    extensions?: ExtendEntityParameters[]
    ownershipChanges?: ChangeOwnershipParameters[]
  },
  txParams?: TxParams,
): Promise<SendArkivTransactionResult> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  const { creates, patches, deletes, extensions, ownershipChanges } = ops

  // The block height, to resolve any relative expiry — which both creates and extensions carry.
  // Skipped entirely for a batch with neither.
  const currentBlock =
    creates?.length || extensions?.length ? await walletClient.getBlockNumber() : 0n

  const expiryContext = { currentBlock }

  const createOps = (creates ?? []).map((item) => {
    validateContentType(item.contentType)

    const salt = item.salt === undefined ? randomSalt() : resolveSalt(item.salt)
    const expiry = resolveExpiry(item.expires, expiryContext)

    return createOperation({
      salt,
      expiry,
      creationFlags: encodeCreationFlags(item.flags),
      attributes: encodeAttributes(item.attributes, {
        payload: item.payload,
        contentType: item.contentType,
      }),
    })
  })

  const patchOps = (patches ?? []).map((item) => {
    if (item.contentType !== undefined) validateContentType(item.contentType)
    const mutations = encodeMutations(item)
    if (mutations.length === 0) {
      throw new EmptyPatchError(item.entityKey)
    }
    return patchOperation({ entityKey: item.entityKey, mutations })
  })

  // An extension resolves its expiry exactly as a create does — the engine applies the same
  // `max(expiresAt, currentBlock + minLifetime)` to both — so the same bounds are checked here
  // rather than left to a revert.
  const extendOps = (extensions ?? []).map((item) => {
    const expiry = resolveExpiry(item.expires, expiryContext)
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
    txHash = await walletClient.writeContract({
      address: ARKIV_ADDRESS,
      abi: EXECUTE_ABI,
      functionName: "execute",
      args: [operations],
      account: client.account,
      chain: client.chain,
      ...txParams,
    })

    const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash })
    logger("Tx receipt %o", receipt)

    if (receipt.status === "reverted") {
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
