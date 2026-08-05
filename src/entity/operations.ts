import { type Address, encodeAbiParameters, type Hex, parseAbi, parseAbiParameters } from "viem"
import type { AbiAttribute } from "../attr/codec"
import type { EncodedExpiry } from "./expiry"
import { OperationType } from "./params"

/**
 * The one external entry point. A transaction is an ordered, **atomic** batch of entity operations:
 * all of them apply or none do, operation *n+1* observes operation *n*'s effects, and each applied
 * operation emits one event.
 */
export const EXECUTE_ABI = parseAbi([
  "function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)",
])

/**
 * The shared attribute shape, used by `create` (attributes) and `patch` (mutations). Written out
 * once and reused by every payload that carries attributes.
 */
const ATTRIBUTE_TUPLE = "(bytes32 name, uint8 typeId, bytes value)[]"

/**
 * The payload struct for each operation tag. `operationData` is `abi.encode` of the struct the tag
 * selects — a tagged union, so a new operation is additive rather than a change to `execute`.
 */
const PAYLOAD_PARAMS = {
  [OperationType.Create]: parseAbiParameters(
    `(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, ${ATTRIBUTE_TUPLE} attributes)`,
  ),
  [OperationType.Patch]: parseAbiParameters(`(bytes32 entityKey, ${ATTRIBUTE_TUPLE} mutations)`),
  [OperationType.ExtendExpiry]: parseAbiParameters(
    "(bytes32 entityKey, uint64 expiresAt, uint64 minLifetime)",
  ),
  [OperationType.TransferOwnership]: parseAbiParameters("(bytes32 entityKey, address newOwner)"),
  [OperationType.Delete]: parseAbiParameters("(bytes32 entityKey)"),
} as const

/** One entry of the `execute` batch: the operation tag and its ABI-encoded payload. */
export type Operation = {
  operation: number
  operationData: Hex
}

/** Creates an entity. The key is derived by the engine; predict it with `predictEntityKey`. */
export function createOperation({
  salt,
  expiry,
  creationFlags,
  attributes,
}: {
  salt: bigint
  expiry: EncodedExpiry
  creationFlags: number
  attributes: AbiAttribute[]
}): Operation {
  return {
    operation: OperationType.Create,
    operationData: encodeAbiParameters(PAYLOAD_PARAMS[OperationType.Create], [
      {
        salt,
        expiresAt: expiry.expiresAt,
        minLifetime: expiry.minLifetime,
        creationFlags,
        attributes,
      },
    ]),
  }
}

/** Applies a set of mutations to an existing entity. Tombstones unset attributes. */
export function patchOperation({
  entityKey,
  mutations,
}: {
  entityKey: Hex
  mutations: AbiAttribute[]
}): Operation {
  return {
    operation: OperationType.Patch,
    operationData: encodeAbiParameters(PAYLOAD_PARAMS[OperationType.Patch], [
      { entityKey, mutations },
    ]),
  }
}

/** Pushes an entity's expiry further out. Extending is allowed; shortening reverts. */
export function extendExpiryOperation({
  entityKey,
  expiry,
}: {
  entityKey: Hex
  expiry: EncodedExpiry
}): Operation {
  return {
    operation: OperationType.ExtendExpiry,
    operationData: encodeAbiParameters(PAYLOAD_PARAMS[OperationType.ExtendExpiry], [
      { entityKey, expiresAt: expiry.expiresAt, minLifetime: expiry.minLifetime },
    ]),
  }
}

/** Hands an entity to a new owner. */
export function transferOwnershipOperation({
  entityKey,
  newOwner,
}: {
  entityKey: Hex
  newOwner: Address
}): Operation {
  return {
    operation: OperationType.TransferOwnership,
    operationData: encodeAbiParameters(PAYLOAD_PARAMS[OperationType.TransferOwnership], [
      { entityKey, newOwner },
    ]),
  }
}

/** Deletes an entity before its expiry. */
export function deleteOperation({ entityKey }: { entityKey: Hex }): Operation {
  return {
    operation: OperationType.Delete,
    operationData: encodeAbiParameters(PAYLOAD_PARAMS[OperationType.Delete], [{ entityKey }]),
  }
}
