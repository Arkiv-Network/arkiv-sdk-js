import {
  type Address,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodePacked,
  type Hex,
  keccak256,
  parseAbi,
  stringToBytes,
  TransactionExecutionError,
  type TransactionReceipt,
  toBytes,
  toHex,
} from "viem"
import type { ChangeOwnershipParameters } from "../actions/wallet/changeOwnership"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import type { DeleteEntityParameters } from "../actions/wallet/deleteEntity"
import type { ExtendEntityParameters } from "../actions/wallet/extendEntity"
import type { UpdateEntityParameters } from "../actions/wallet/updateEntity"
import type { ArkivClient } from "../clients/baseClient"
import type { WalletArkivClient } from "../clients/createWalletClient"
import { ARKIV_ADDRESS, BLOCK_TIME } from "../consts"
import { DuplicateAttributeError, EntityMutationError, InvalidContentTypeError } from "../errors"
import type { TxParams } from "../types"
import { EntityOperationType } from "../types/entity"
import { RpcAttributeValueType as AttributeValueType } from "../types/rpcSchema"

import { getLogger } from "./logger"
import { isEntityKey, validateAttribute, validateExpiresIn } from "./validation"

const logger = getLogger("utils:arkiv-transactions")

// RFC 2045 token chars, lowercase only. Rejects uppercase to prevent text/plain vs Text/Plain ambiguity.
const MIME_REGEX = /^[a-z][a-z0-9!#$&\-^_]*\/[a-z0-9][a-z0-9!#$&\-^_.+]*$/

function validateContentType(contentType: string): void {
  if (!MIME_REGEX.test(contentType)) {
    throw new InvalidContentTypeError(contentType)
  }
}

// Mime128 = struct { bytes32[4] data }  (128-byte fixed MIME type container)
// Attribute = struct { bytes32 name, uint8 valueType, bytes32[4] value }
// BlockNumber = type BlockNumber is uint32
export const ENTITY_EXECUTE_ABI = parseAbi([
  "function execute((uint8 operationType, bytes32 entityKey, bytes payload, (bytes32[4] data) contentType, (bytes32 name, uint8 valueType, bytes32[4] value)[] attributes, uint32 expiresIn, address newOwner)[] ops) external",
])

export const ENTITY_OPERATION_EVENT_ABI = parseAbi([
  "event EntityOperation(bytes32 indexed entityKey, uint8 indexed operationType, address indexed owner, uint32 expiresAt, bytes32 entityHash)",
])

export const ENTITY_ERRORS_ABI = parseAbi([
  "error EmptyBatch()",
  "error AttributesNotSorted()",
  "error InvalidValueType(bytes32 name, uint8 valueType)",
  "error InvalidOpType(uint8 operationType)",
  "error ExpiryInPast(uint32 expiresAt, uint32 currentBlock)",
  "error TooManyAttributes(uint256 count, uint256 maxCount)",
  "error EntityNotFound(bytes32 entityKey)",
  "error NotOwner(bytes32 entityKey, address caller, address owner)",
  "error EntityExpired(bytes32 entityKey, uint32 expiresAt)",
  "error ExpiryNotExtended(bytes32 entityKey, uint32 newExpiresAt, uint32 currentExpiresAt)",
  "error TransferToZeroAddress(bytes32 entityKey)",
  "error TransferToSelf(bytes32 entityKey)",
  "error EntityNotExpired(bytes32 entityKey, uint32 expiresAt)",
  "error Ident32Empty()",
  "error Ident32TooLong(uint256 length)",
  "error Ident32InvalidByte(uint256 position, bytes1 value)",
  "error MimeEmpty()",
  "error MimeTooLong(uint256 length, uint256 maxLength)",
  "error MimeInvalidByte(uint256 position, bytes1 value)",
  "error MimeIncomplete()",
])

const EXECUTE_ABI = [...ENTITY_EXECUTE_ABI, ...ENTITY_ERRORS_ABI]

const ENTITY_NONCE_ABI = parseAbi(["function nonces(address owner) view returns (uint32)"])

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"
const ZERO_32 = `0x${"00".repeat(32)}` as Hex
const EMPTY_BYTES128 = [ZERO_32, ZERO_32, ZERO_32, ZERO_32] as const

// Encode a string or bytes into a bytes32[4] (128-byte) container, left-aligned.
function encodeBytes128(data: Uint8Array): readonly [Hex, Hex, Hex, Hex] {
  const padded = new Uint8Array(128)
  padded.set(data.slice(0, 128))
  return [
    toHex(padded.slice(0, 32)),
    toHex(padded.slice(32, 64)),
    toHex(padded.slice(64, 96)),
    toHex(padded.slice(96, 128)),
  ]
}

// Mime128 struct: bytes32[4] data, string packed left-aligned into 128 bytes.
function encodeMime128(contentType: string): { data: readonly [Hex, Hex, Hex, Hex] } {
  return { data: contentType ? encodeBytes128(stringToBytes(contentType)) : EMPTY_BYTES128 }
}

function encodeAttribute(attr: { key: string; value: Hex | string | number }) {
  validateAttribute(attr)
  const name = toHex(attr.key, { size: 32 })

  if (typeof attr.value === "string") {
    // Only exact 32-byte hex (an entity key) gets the EntityKey type; shorter or
    // longer hex-looking strings are stored as plain strings so they round-trip
    // unchanged and stay matchable by quoted string queries.
    if (isEntityKey(attr.value)) {
      return {
        name,
        valueType: AttributeValueType.EntityKey,
        value: [toHex(toBytes(attr.value), { size: 32 }), ZERO_32, ZERO_32, ZERO_32] as const,
      }
    }
    return {
      name,
      valueType: AttributeValueType.String,
      // stringToBytes, not toBytes: toBytes hex-decodes hex-looking strings, which
      // would corrupt string values like "0xab" instead of UTF-8 encoding them
      value: encodeBytes128(stringToBytes(attr.value)),
    }
  }

  return {
    name,
    valueType: AttributeValueType.Uint,
    value: [toHex(BigInt(attr.value), { size: 32 }), ZERO_32, ZERO_32, ZERO_32] as const,
  }
}

// The registry requires attributes strictly ascending by their bytes32 name — the
// canonical serialization hashes into the state root, and strict ordering doubles as
// the uniqueness check (AttributesNotSorted). Sort here so callers can pass any order;
// duplicates would revert on-chain, so reject them client-side with a clear error.
function encodeAttributes(attrs: { key: string; value: Hex | string | number }[]) {
  const encoded = attrs
    .map((attr) => ({ key: attr.key, ...encodeAttribute(attr) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (let i = 1; i < encoded.length; i++) {
    if (encoded[i].name === encoded[i - 1].name) {
      throw new DuplicateAttributeError(encoded[i].key)
    }
  }
  return encoded.map(({ key: _, ...attr }) => attr)
}

function toBTL(expiresIn: number): number {
  validateExpiresIn(expiresIn)
  return Math.ceil(expiresIn / BLOCK_TIME)
}

// entityKey = keccak256(chainId || registryAddress || ownerAddress || nonce)
function deriveEntityKey(chainId: number, owner: Address, nonce: bigint): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "address", "address", "uint32"],
      [BigInt(chainId), ARKIV_ADDRESS, owner, Number(nonce)],
    ),
  )
}

export type SendArkivTransactionResult = {
  receipt: TransactionReceipt
  createdEntityKeys: Hex[]
}

export async function sendArkivTransaction(
  client: ArkivClient,
  ops: {
    creates?: CreateEntityParameters[]
    updates?: UpdateEntityParameters[]
    deletes?: DeleteEntityParameters[]
    extensions?: ExtendEntityParameters[]
    ownershipChanges?: ChangeOwnershipParameters[]
  },
  txParams?: TxParams,
): Promise<SendArkivTransactionResult> {
  if (!client.account) throw new Error("Account required")
  if (!client.chain) throw new Error("Chain required")
  const walletClient = client as WalletArkivClient

  const { creates, updates, deletes, extensions, ownershipChanges } = ops
  const owner = client.account.address as Address

  const ownerNonce: bigint = creates?.length
    ? BigInt(
        await walletClient.readContract({
          address: ARKIV_ADDRESS,
          abi: ENTITY_NONCE_ABI,
          functionName: "nonces",
          args: [owner],
        }),
      )
    : 0n

  const createdEntityKeys: Hex[] = (creates ?? []).map((_, i) =>
    deriveEntityKey(client.chain!.id, owner, ownerNonce + BigInt(i)),
  )

  for (const item of creates ?? []) validateContentType(item.contentType)
  for (const item of updates ?? []) validateContentType(item.contentType)

  const operations = [
    ...(creates ?? []).map((item, i) => ({
      operationType: EntityOperationType.Create,
      entityKey: createdEntityKeys[i],
      payload: toHex(item.payload),
      contentType: encodeMime128(item.contentType),
      attributes: encodeAttributes(item.attributes),
      expiresIn: toBTL(item.expiresIn),
      newOwner: ZERO_ADDRESS,
    })),
    ...(updates ?? []).map((item) => ({
      operationType: EntityOperationType.Update,
      entityKey: item.entityKey,
      payload: toHex(item.payload),
      contentType: encodeMime128(item.contentType),
      attributes: encodeAttributes(item.attributes),
      expiresIn: 0, // contract ignores expiresAt on UPDATE
      newOwner: ZERO_ADDRESS,
    })),
    ...(deletes ?? []).map((item) => ({
      operationType: EntityOperationType.Delete,
      entityKey: item.entityKey,
      payload: "0x" as Hex,
      contentType: encodeMime128(""),
      attributes: [] as never[],
      expiresIn: 0,
      newOwner: ZERO_ADDRESS,
    })),
    ...(extensions ?? []).map((item) => ({
      operationType: EntityOperationType.Extend,
      entityKey: item.entityKey,
      payload: "0x" as Hex,
      contentType: encodeMime128(""),
      attributes: [] as never[],
      expiresIn: toBTL(item.expiresIn),
      newOwner: ZERO_ADDRESS,
    })),
    ...(ownershipChanges ?? []).map((item) => ({
      operationType: EntityOperationType.Transfer,
      entityKey: item.entityKey,
      payload: "0x" as Hex,
      contentType: encodeMime128(""),
      attributes: [] as never[],
      expiresIn: 0,
      newOwner: item.newOwner as Address,
    })),
  ]

  logger("Sending execute with %d operations %s", operations.length, JSON.stringify(operations))

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

    return { receipt, createdEntityKeys }
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
    }

    throw new EntityMutationError(message)
  }
}
