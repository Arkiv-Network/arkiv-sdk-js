import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
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
import { resolveExpiry } from "../entity/expiry"
import { encodeCreationFlags } from "../entity/flags"
import { predictEntityKey, randomSalt, validateSalt } from "../entity/key"
import {
  createOperation,
  deleteOperation,
  EXECUTE_ABI as EXECUTE_FUNCTION_ABI,
  extendExpiryOperation,
  type Operation,
  patchOperation,
  transferOwnershipOperation,
} from "../entity/operations"
import { DEFAULT_PROTOCOL_PARAMS, type ProtocolParams } from "../entity/params"
import { EmptyPatchError, EntityMutationError, InvalidContentTypeError } from "../errors"
import type { TxParams } from "../types"

import { getLogger } from "./logger"

const logger = getLogger("utils:arkiv-transactions")

// RFC 2045 token chars, lowercase only. Rejects uppercase to prevent text/plain vs Text/Plain ambiguity.
const MIME_REGEX = /^[a-z][a-z0-9!#$&\-^_]*\/[a-z0-9][a-z0-9!#$&\-^_.+]*$/

function validateContentType(contentType: string): void {
  if (!MIME_REGEX.test(contentType)) {
    throw new InvalidContentTypeError(contentType)
  }
}

export const ENTITY_ERRORS_ABI = parseAbi([
  "error EmptyBatch()",
  "error UnknownOperation(uint8 operation)",
  "error NonCanonicalOperationData()",
  "error AttributesNotSorted()",
  "error TombstoneInCreate(bytes32 name)",
  "error SystemCellNotWritable(bytes32 name)",
  "error InvalidTypeId(bytes32 name, uint8 typeId)",
  "error InvalidName(bytes32 name)",
  "error TooManyAttributes(uint256 count, uint256 maxCount)",
  "error EntityNotFound(bytes32 entityKey)",
  "error NotOwner(bytes32 entityKey, address caller, address owner)",
  "error EntityReadonly(bytes32 entityKey)",
  "error ExpiresAtTooLarge(uint256 expiresAt, uint256 maxExpiresAt)",
  "error MinLifetimeTooLarge(uint256 minLifetime, uint256 maxLifetime)",
  "error LifetimeTooLong(uint256 target, uint256 maxTarget)",
  "error ExpiryDeadOnArrival(uint256 target, uint256 currentBlock)",
  "error ExpiryNotExtended(bytes32 entityKey, uint256 target, uint256 currentExpiresAt)",
  "error TransferToZeroAddress(bytes32 entityKey)",
  "error TransferToSelf(bytes32 entityKey)",
])

const EXECUTE_ABI = [...EXECUTE_FUNCTION_ABI, ...ENTITY_ERRORS_ABI]

const ENTITY_NONCE_ABI = parseAbi(["function entityNonce(address owner) view returns (uint256)"])

export type SendArkivTransactionResult = {
  receipt: TransactionReceipt
  /** The keys of the entities created by this transaction, in batch order. */
  createdEntityKeys: Hex[]
  /** The block each created entity is expected to expire at, in the same order. */
  createdExpiries: bigint[]
  /** The block each extended entity is expected to expire at, in batch order. */
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
  params: ProtocolParams = DEFAULT_PROTOCOL_PARAMS,
): Promise<SendArkivTransactionResult> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  const { creates, patches, deletes, extensions, ownershipChanges } = ops
  const owner = client.account.address as Address

  // The nonce is needed only to derive the keys of new entities; the block height to resolve any
  // relative expiry, which both creates and extensions carry. Fetched together so the second round
  // trip costs no wall-clock time, and skipped entirely for a batch that needs neither.
  const [ownerNonce, currentBlock] = await Promise.all([
    creates?.length
      ? walletClient
          .readContract({
            address: ARKIV_ADDRESS,
            abi: ENTITY_NONCE_ABI,
            functionName: "entityNonce",
            args: [owner],
          })
          .then(BigInt)
      : 0n,
    creates?.length || extensions?.length ? walletClient.getBlockNumber() : 0n,
  ])

  const expiryContext = { currentBlock, params }

  const createdEntityKeys: Hex[] = []
  const createdExpiries: bigint[] = []
  const extendedExpiries: bigint[] = []

  const createOps = (creates ?? []).map((item, index) => {
    validateContentType(item.contentType)

    const salt = item.salt === undefined ? randomSalt() : validateSalt(item.salt)
    const expiry = resolveExpiry(item.expires, expiryContext)

    // A create consumes one nonce, so the nth create in the batch derives from nonce + n.
    const nonce = ownerNonce + BigInt(index)
    createdEntityKeys.push(predictEntityKey({ owner, nonce, salt, params }))
    createdExpiries.push(expiry.target)

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
    extendedExpiries.push(expiry.target)
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

  try {
    const txHash = await walletClient.writeContract({
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
          error.shortMessage ?? error.cause?.details ?? "No reason provided by backend."
        throw new EntityMutationError(
          `Transaction ${receipt.transactionHash} reverted. Reason: ${reason}`,
        )
      }
      throw new EntityMutationError(
        `Transaction ${receipt.transactionHash} reverted. No reason provided by backend.`,
      )
    }

    return { receipt, createdEntityKeys, createdExpiries, extendedExpiries }
  } catch (error) {
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

    throw new EntityMutationError(message, { cause: error })
  }
}
