import { describe, expect, it, vi } from "bun:test"
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  parseAbiParameters,
  type TransactionReceipt,
  TransactionReceiptNotFoundError,
} from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { ARKIV_ADDRESS } from "../../consts"
import { ENTITY_EVENTS_ABI } from "../../entity/events"
import { ExpirationTime } from "../../utils/expirationTime"
import { buildMutation } from "./buildMutation"
import { decodeMutationResult, getMutationResult } from "./getMutationResult"
import { pingTransaction } from "./pingTransaction"
import { sendMutation } from "./sendMutation"

const ENTITY_KEY = `0x${"ab".repeat(32)}` as const
const OWNER = "0x1111111111111111111111111111111111111111"
const NEW_OWNER = "0x2222222222222222222222222222222222222222"
const TX_HASH = `0x${"cd".repeat(32)}` as const

const CREATE = {
  payload: new Uint8Array([1, 2, 3]),
  contentType: "application/json",
  expires: ExpirationTime.atBlock(1_000_000n),
}

function makeWalletClient() {
  const writeContract = vi.fn().mockResolvedValue(TX_HASH)
  const getBlockNumber = vi.fn().mockResolvedValue(100n)
  const waitForTransactionReceipt = vi.fn()
  const simulateContract = vi.fn()
  return {
    client: {
      account: { address: OWNER },
      chain: { id: 1 },
      getBlockNumber,
      writeContract,
      waitForTransactionReceipt,
      simulateContract,
    } as unknown as ArkivClient,
    writeContract,
    getBlockNumber,
    waitForTransactionReceipt,
    simulateContract,
  }
}

function makeReceiptClient(receiptOrError: TransactionReceipt | Error) {
  const getTransactionReceipt =
    receiptOrError instanceof Error
      ? vi.fn().mockRejectedValue(receiptOrError)
      : vi.fn().mockResolvedValue(receiptOrError)
  return {
    client: { getTransactionReceipt } as unknown as ArkivClient,
    getTransactionReceipt,
  }
}

/** A receipt log as the engine emits it: topics for the indexed args, data for the rest. */
function entityLog(
  eventName: (typeof ENTITY_EVENTS_ABI)[number]["name"],
  args: Record<string, unknown>,
  data: Hex = "0x",
  address: string = ARKIV_ADDRESS,
) {
  return {
    address,
    topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName, args } as never),
    data,
  }
}

function receiptWith(logs: unknown[], status: "success" | "reverted" = "success") {
  return {
    status,
    transactionHash: TX_HASH,
    blockNumber: 123n,
    logs,
  } as unknown as TransactionReceipt
}

describe("buildMutation", () => {
  it("spends no RPC call when every expiry is an absolute block", async () => {
    const { client, getBlockNumber } = makeWalletClient()
    const built = await buildMutation(client, {
      creates: [CREATE],
      extensions: [{ entityKey: ENTITY_KEY, expires: ExpirationTime.atBlock(2_000_000n) }],
    })
    expect(getBlockNumber).not.toHaveBeenCalled()
    expect(built.operations).toHaveLength(2)
    expect(built.to).toBe(ARKIV_ADDRESS)
    expect(built.data.startsWith("0x")).toBe(true)
    expect(built.expected).toEqual({
      creates: 1,
      patches: 0,
      deletes: 0,
      extensions: 1,
      ownershipChanges: 0,
    })
  })

  it("fetches the head once for a relative lifetime, and not at all when it is supplied", async () => {
    const { client, getBlockNumber } = makeWalletClient()
    const relative = { ...CREATE, expires: ExpirationTime.fromDays(1) }

    await buildMutation(client, { creates: [relative] })
    expect(getBlockNumber).toHaveBeenCalledTimes(1)

    getBlockNumber.mockClear()
    await buildMutation(client, { creates: [relative] }, { currentBlock: 100n })
    expect(getBlockNumber).not.toHaveBeenCalled()
  })

  it("needs no head for batches without expiries at all", async () => {
    const { client, getBlockNumber } = makeWalletClient()
    const built = await buildMutation(client, {
      deletes: [{ entityKey: ENTITY_KEY }],
      ownershipChanges: [{ entityKey: ENTITY_KEY, newOwner: NEW_OWNER }],
    })
    expect(getBlockNumber).not.toHaveBeenCalled()
    expect(built.operations).toHaveLength(2)
  })

  it("still rejects an empty batch locally", async () => {
    const { client } = makeWalletClient()
    await expect(buildMutation(client, {})).rejects.toThrow(/No operations/)
  })
})

describe("sendMutation", () => {
  it("submits once and never waits, polls or simulates", async () => {
    const { client, writeContract, waitForTransactionReceipt, simulateContract, getBlockNumber } =
      makeWalletClient()
    const { txHash, expected } = await sendMutation(client, { creates: [CREATE] })

    expect(txHash).toBe(TX_HASH)
    expect(expected.creates).toBe(1)
    expect(writeContract).toHaveBeenCalledTimes(1)
    // The whole point of the advanced path: nothing beyond the submission itself.
    expect(getBlockNumber).not.toHaveBeenCalled()
    expect(waitForTransactionReceipt).not.toHaveBeenCalled()
    expect(simulateContract).not.toHaveBeenCalled()
  })

  it("forwards txParams so viem has nothing left to look up", async () => {
    const { client, writeContract } = makeWalletClient()
    await sendMutation(
      client,
      { deletes: [{ entityKey: ENTITY_KEY }] },
      { txParams: { nonce: 7, gas: 1_000_000n, gasPrice: 2n } },
    )
    const call = writeContract.mock.calls[0][0]
    expect(call.nonce).toBe(7)
    expect(call.gas).toBe(1_000_000n)
    expect(call.gasPrice).toBe(2n)
  })

  it("requires an account and a chain", async () => {
    const { client } = makeWalletClient()
    const noAccount = { ...(client as object), account: undefined } as unknown as ArkivClient
    await expect(sendMutation(noAccount, { creates: [CREATE] })).rejects.toThrow(/Account/)
  })
})

describe("pingTransaction", () => {
  it("reports pending instead of throwing when the receipt is not there yet", async () => {
    const { client, getTransactionReceipt } = makeReceiptClient(
      new TransactionReceiptNotFoundError({ hash: TX_HASH }),
    )
    expect(await pingTransaction(client, TX_HASH)).toEqual({ status: "pending" })
    expect(getTransactionReceipt).toHaveBeenCalledTimes(1)
  })

  it("reports a mined transaction with its block", async () => {
    const { client } = makeReceiptClient(receiptWith([]))
    expect(await pingTransaction(client, TX_HASH)).toEqual({ status: "success", blockNumber: 123n })
  })

  it("reports a reverted transaction as reverted, not as an error", async () => {
    const { client } = makeReceiptClient(receiptWith([], "reverted"))
    expect(await pingTransaction(client, TX_HASH)).toEqual({
      status: "reverted",
      blockNumber: 123n,
    })
  })

  it("lets transport errors through untouched", async () => {
    const { client } = makeReceiptClient(new Error("connection refused"))
    await expect(pingTransaction(client, TX_HASH)).rejects.toThrow(/connection refused/)
  })
})

describe("getMutationResult and decodeMutationResult", () => {
  const createdData = encodeAbiParameters(parseAbiParameters("uint64, uint8"), [555n, 0])
  const extendedData = encodeAbiParameters(parseAbiParameters("uint64"), [999n])
  const fullReceipt = receiptWith([
    entityLog("EntityCreated", { entityKey: ENTITY_KEY, owner: OWNER }, createdData),
    entityLog("EntityPatched", { entityKey: ENTITY_KEY, owner: OWNER }),
    entityLog("EntityDeleted", { entityKey: ENTITY_KEY, owner: OWNER }),
    entityLog("ExpiryExtended", { entityKey: ENTITY_KEY, owner: OWNER }, extendedData),
    entityLog("OwnershipTransferred", {
      entityKey: ENTITY_KEY,
      previousOwner: OWNER,
      newOwner: NEW_OWNER,
    }),
  ])

  it("turns one receipt fetch into the full decoded result", async () => {
    const { client, getTransactionReceipt } = makeReceiptClient(fullReceipt)
    const result = await getMutationResult(client, TX_HASH)

    expect(getTransactionReceipt).toHaveBeenCalledTimes(1)
    if (result.status === "pending") throw new Error("expected a mined result")
    expect(result.txHash).toBe(TX_HASH)
    expect(result.blockNumber).toBe(123n)
    expect(result.createdEntities).toEqual([ENTITY_KEY])
    expect(result.createdExpiries).toEqual([555n])
    expect(result.patchedEntities).toEqual([ENTITY_KEY])
    expect(result.deletedEntities).toEqual([ENTITY_KEY])
    expect(result.extendedEntities).toEqual([ENTITY_KEY])
    expect(result.extendedExpiries).toEqual([999n])
    expect(result.ownershipChanges).toEqual([ENTITY_KEY])
    expect(result.receipt).toBe(fullReceipt)
  })

  it("reports pending before the transaction is mined", async () => {
    const { client } = makeReceiptClient(new TransactionReceiptNotFoundError({ hash: TX_HASH }))
    expect(await getMutationResult(client, TX_HASH)).toEqual({ status: "pending" })
  })

  it("decodes a held receipt with zero RPC calls", () => {
    const result = decodeMutationResult(fullReceipt)
    expect(result.status).toBe("success")
    expect(result.createdEntities).toEqual([ENTITY_KEY])
  })

  it("skips logs from other contracts and events it has no name for", () => {
    const foreign = entityLog(
      "EntityCreated",
      { entityKey: ENTITY_KEY, owner: OWNER },
      createdData,
      "0x9999999999999999999999999999999999999999",
    )
    const unknown = { address: ARKIV_ADDRESS, topics: [`0x${"ff".repeat(32)}`], data: "0x" }
    const result = decodeMutationResult(receiptWith([foreign, unknown]))
    expect(result.createdEntities).toEqual([])
  })

  it("is lenient: a reverted receipt decodes to empty arrays, never an error", () => {
    const result = decodeMutationResult(receiptWith([], "reverted"))
    expect(result.status).toBe("reverted")
    expect(result.createdEntities).toEqual([])
    expect(result.deletedEntities).toEqual([])
  })
})
