import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  decodeEventLog,
  type Hash,
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
import { type Expiry, type ExpiryContext, resolveExpiry } from "../entity/expiry"
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

// RFC 2045 token chars, lowercase only. Rejects uppercase to prevent text/plain vs Text/Plain ambiguity.
const MIME_REGEX = /^[a-z][a-z0-9!#$&\-^_]*\/[a-z0-9][a-z0-9!#$&\-^_.+]*$/

function validateContentType(contentType: string): void {
  if (!MIME_REGEX.test(contentType)) {
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
  ops: EntityMutationOps,
  txParams?: TxParams,
): Promise<SendArkivTransactionResult> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  const { creates, extensions } = ops

  // The block height, to resolve any relative expiry — which both creates and extensions carry.
  // Skipped entirely for a batch with neither. Deliberately fetched even when every expiry is
  // absolute (where `mutationNeedsBlockNumber` would say no): the head is what makes the local
  // dead-on-arrival check in `resolveExpiry` work, and the everyday path buys that check — the
  // advanced path is where both are traded away for the saved call.
  const currentBlock =
    creates?.length || extensions?.length ? await walletClient.getBlockNumber() : 0n

  const operations = buildEntityOperations(ops, { currentBlock })

  logger("Sending execute with %d operations %o", operations.length, operations)

  const txHash = await submitMutation(client, operations, txParams)

  try {
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
        creates: creates?.length ?? 0,
        extensions: extensions?.length ?? 0,
      }),
    }
  } catch (error) {
    throw asEntityMutationError(error, txHash)
  }
}

/**
 * Wraps whatever a write step threw into an {@link EntityMutationError} — engine terms when the
 * revert data decodes, the node's own message otherwise. An {@link EntityMutationError} passes
 * through unchanged, so wrapped steps compose without double-wrapping.
 *
 * `txHash` is the transaction the failure belongs to, when the step got far enough to have one —
 * a send that never returned a hash has none to report.
 */
function asEntityMutationError(error: unknown, txHash?: Hash): EntityMutationError {
  if (error instanceof EntityMutationError) return error

  const described = describeEntityRevert(error)
  if (described !== undefined) {
    return new EntityMutationError(`Transaction failed: ${described}`, { cause: error, txHash })
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
  } else if (error instanceof Error) {
    message += `: ${error.message}`
  }

  return new EntityMutationError(message, { cause: error, txHash })
}

/**
 * The keys and expiries the engine recorded, read back from the events the batch emitted.
 */
function readAppliedOperations(
  receipt: TransactionReceipt,
  expected: { creates: number; extensions: number },
): Omit<SendArkivTransactionResult, "receipt"> {
  const events = collectMutationEvents(receipt.logs)

  const createdEntityKeys = events.created.map((e) => e.entityKey)
  const createdExpiries = events.created.map((e) => e.expiresAt)
  const extendedExpiries = events.extended.map((e) => e.expiresAt)

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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The seams the advanced path is built on.
//
// `sendArkivTransaction` above is the everyday path: encode, send, wait, decode, diagnose. These
// are the same steps as separate pieces, so `actions/advanced` can spend exactly the RPC calls a
// caller asks for and no more — without a second copy of the encoding or the event decoding.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The five kinds of entity operation one Arkiv transaction can batch. */
export type EntityMutationOps = {
  /** The entities to create. */
  creates?: CreateEntityParameters[]
  /** The patches to apply. */
  patches?: PatchEntityParameters[]
  /** The entities to delete. */
  deletes?: DeleteEntityParameters[]
  /** The expiries to set. */
  extensions?: ExtendEntityParameters[]
  /** The ownership transfers to perform. */
  ownershipChanges?: ChangeOwnershipParameters[]
}

/**
 * Whether encoding the batch actually requires the chain head.
 *
 * Only a relative lifetime (`minLifetime > 0`) or a wall-clock deadline (a `Date`) is measured
 * from the current block. A purely absolute `atBlock(n)` expiry encodes the same bytes whatever
 * the head is, so a batch of those — or one with no expiries at all — needs no `eth_blockNumber`.
 */
export function mutationNeedsBlockNumber(ops: EntityMutationOps): boolean {
  return [...(ops.creates ?? []), ...(ops.extensions ?? [])].some((item) => {
    const expires = item.expires as Expiry | undefined
    // Malformed expiries are rejected by buildEntityOperations without needing the head.
    if (expires === undefined || typeof expires.minLifetime !== "bigint") return false
    return expires.minLifetime !== 0n || expires.expiresAt instanceof Date
  })
}

/**
 * Encodes a batch into the `execute` operations, in the order the engine applies them: creates,
 * patches, deletes, extensions, ownership transfers.
 *
 * Pure — every check here is local (content types, salts, expiry bounds, non-empty patches and a
 * non-empty batch), so the only chain input is `context.currentBlock`. Callers that carry no
 * relative expiry (see {@link mutationNeedsBlockNumber}) can pass `0n`, which disables the
 * dead-on-arrival pre-check and leaves that to the engine.
 */
export function buildEntityOperations(ops: EntityMutationOps, context: ExpiryContext): Operation[] {
  const { creates, patches, deletes, extensions, ownershipChanges } = ops

  const createOps = (creates ?? []).map((item) => {
    validateContentType(item.contentType)

    const salt = item.salt === undefined ? randomSalt() : resolveSalt(item.salt)
    const expiry = resolveExpiry(item.expires, context)

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
    const expiry = resolveExpiry(item.expires, context)
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

  return operations
}

/**
 * Signs and sends an encoded batch, wrapping any node rejection in {@link EntityMutationError}.
 *
 * The submission half both write paths share: one `writeContract` — an `eth_sendRawTransaction`,
 * plus only the lookups viem needs for whatever `txParams` leaves out — with no waiting and no
 * polling. A rejection is reported in engine terms when the node returned decodable revert data,
 * and with the node's own message otherwise; either way the caller sees an
 * {@link EntityMutationError}.
 *
 * Internal seam shared with `actions/advanced/sendMutation`; not part of the package's public
 * surface.
 */
export async function submitMutation(
  client: ArkivClient,
  operations: Operation[],
  txParams?: TxParams,
): Promise<Hash> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  try {
    return await walletClient.writeContract({
      address: ARKIV_ADDRESS,
      abi: EXECUTE_ABI,
      functionName: "execute",
      args: [operations],
      account: client.account,
      chain: client.chain,
      ...txParams,
    })
  } catch (error) {
    throw asEntityMutationError(error)
  }
}

/** Everything the batch's events say happened, one entry per applied operation, per kind. */
export type MutationEvents = {
  created: { entityKey: Hex; owner: Address; expiresAt: bigint }[]
  patched: { entityKey: Hex; owner: Address }[]
  deleted: { entityKey: Hex; owner: Address }[]
  extended: { entityKey: Hex; owner: Address; expiresAt: bigint }[]
  ownershipTransferred: { entityKey: Hex; previousOwner: Address; newOwner: Address }[]
}

/**
 * Reads the entity events out of a receipt's logs, exactly as they were emitted.
 *
 * Lenient by design: it reports what the events say and nothing else — no counting against what
 * was asked for (the caller may not have the request at hand) and no error for a receipt with no
 * entity events at all. Logs from other contracts and events this SDK has no name for are skipped.
 */
export function collectMutationEvents(logs: TransactionReceipt["logs"]): MutationEvents {
  const events: MutationEvents = {
    created: [],
    patched: [],
    deleted: [],
    extended: [],
    ownershipTransferred: [],
  }

  // `?? []` so a receipt without logs decodes to "nothing happened" rather than a TypeError.
  for (const log of logs ?? []) {
    // Only the operation address emits these, and a batch's transaction can carry logs from
    // anything else it touched.
    if (log.address.toLowerCase() !== ARKIV_ADDRESS.toLowerCase()) continue
    const decoded = decodeEntityLog(log)
    if (decoded === undefined) continue

    switch (decoded.eventName) {
      case "EntityCreated":
        events.created.push({
          entityKey: decoded.args.entityKey,
          owner: decoded.args.owner,
          expiresAt: decoded.args.expiresAt,
        })
        break
      case "EntityPatched":
        events.patched.push({ entityKey: decoded.args.entityKey, owner: decoded.args.owner })
        break
      case "EntityDeleted":
        events.deleted.push({ entityKey: decoded.args.entityKey, owner: decoded.args.owner })
        break
      case "ExpiryExtended":
        events.extended.push({
          entityKey: decoded.args.entityKey,
          owner: decoded.args.owner,
          expiresAt: decoded.args.expiresAt,
        })
        break
      case "OwnershipTransferred":
        events.ownershipTransferred.push({
          entityKey: decoded.args.entityKey,
          previousOwner: decoded.args.previousOwner,
          newOwner: decoded.args.newOwner,
        })
        break
    }
  }

  return events
}
