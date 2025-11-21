import { type Hex, TransactionExecutionError, toBytes, toHex, toRlp } from "viem"
import type { ChangeOwnershipParameters } from "../actions/wallet/changeOwnership"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import type { DeleteEntityParameters } from "../actions/wallet/deleteEntity"
import type { ExtendEntityParameters } from "../actions/wallet/extendEntity"
import type { UpdateEntityParameters } from "../actions/wallet/updateEntity"
import type { ArkivClient } from "../clients/baseClient"
import type { WalletArkivClient } from "../clients/createWalletClient"
import { ARKIV_ADDRESS, BLOCK_TIME } from "../consts"
import { EntityMutationError } from "../errors"
import type { TxParams } from "../types"
import { compress } from "./compression"
import { getLogger } from "./logger"

const logger = getLogger("utils:arkiv-transactions")

export function opsToTxData({
  creates,
  updates,
  deletes,
  extensions,
  ownershipChanges,
}: {
  creates?: CreateEntityParameters[]
  updates?: UpdateEntityParameters[]
  deletes?: DeleteEntityParameters[]
  extensions?: ExtendEntityParameters[]
  ownershipChanges?: ChangeOwnershipParameters[]
}) {
  function formatAttributes<T extends string | number | bigint | boolean>(attribute: {
    key: string
    value: T
  }): [Hex, Hex] {
    return [toHex(attribute.key), toHex(attribute.value)]
  }

  const payload = [
    //creates
    (creates ?? []).map((item) => [
      toHex(item.expiresIn / BLOCK_TIME),
      toHex(item.contentType),
      toHex(item.payload),
      item.attributes
        .filter((attribute) => typeof attribute.value === "string")
        .map(formatAttributes),
      item.attributes
        .filter((attribute) => typeof attribute.value === "number")
        .map(formatAttributes),
    ]),
    //updates
    (updates ?? []).map((item) => [
      item.entityKey,
      toHex(item.contentType),
      toHex(item.expiresIn / BLOCK_TIME),
      toHex(item.payload),
      item.attributes
        .filter((attribute) => typeof attribute.value === "string")
        .map(formatAttributes),
      item.attributes
        .filter((attribute) => typeof attribute.value === "number")
        .map(formatAttributes),
    ]),
    //deletes
    (deletes ?? []).map((item) => item.entityKey),
    //extends
    (extensions ?? []).map((item) => [item.entityKey, toHex(item.expiresIn / BLOCK_TIME)]),
    //ownershipChanges TODO
    (ownershipChanges ?? []).map((item) => [item.entityKey, item.newOwner]),
  ]

  logger("txData to send as RLP %o length %d", payload, payload.length)

  return toRlp(payload)
}

export async function sendArkivTransaction(client: ArkivClient, data: Hex, txParams?: TxParams) {
  if (!client.account) throw new Error("Account required")
  const walletClient = client as WalletArkivClient

  logger("Sending transaction %o", {
    account: client.account,
    chain: client.chain,
    to: ARKIV_ADDRESS,
    value: 0n,
    data,
    ...txParams,
  })

  try {
    const compressed = await compress(toBytes(data))
    const txHash = await walletClient.sendTransaction({
      account: client.account,
      chain: client.chain,
      to: ARKIV_ADDRESS,
      value: 0n,
      data: toHex(compressed),
      ...txParams,
    })

    const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash })
    logger("Tx receipt %o", receipt)
    if (receipt.status === "reverted") {
      logger("Reverted transaction %o", receipt)
      throw new EntityMutationError(
        `Transaction ${receipt.transactionHash} reverted. Please make sure the data for entities doesn't contain invalid characters or invalid data types.`,
      )
    }

    return receipt
  } catch (error) {
    let message = "Transaction failed"
    if (error instanceof TransactionExecutionError) {
      message += `: ${error.details}`
    } else if (error instanceof EntityMutationError) {
      throw error
    }

    logger("%s Detailed error stack: %o", message, error)
    throw new EntityMutationError(message)
  }
}
