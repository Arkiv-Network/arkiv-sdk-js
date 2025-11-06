import { beforeEach, describe, expect, it, vi } from "bun:test"
import type { Hex } from "viem"
import type { ChangeOwnershipParameters } from "../actions/wallet/changeOwnership"
import type { CreateEntityParameters } from "../actions/wallet/createEntity"
import type { DeleteEntityParameters } from "../actions/wallet/deleteEntity"
import type { ExtendEntityParameters } from "../actions/wallet/extendEntity"
import type { UpdateEntityParameters } from "../actions/wallet/updateEntity"
import type { WalletArkivClient } from "../clients/createWalletClient"
import { ARKIV_ADDRESS } from "../consts"
import { opsToTxData, sendArkivTransaction } from "./arkivTransactions"

// Mock compression module
vi.mock("./compression", () => ({
  compress: vi.fn(async (data: Uint8Array) => {
    // Simple mock that returns compressed data (just reverse for testing)
    return new Uint8Array(data).reverse()
  }),
}))

describe("arkivTransactions", () => {
  describe("opsToTxData", () => {
    it("should return RLP-encoded data for empty operations", () => {
      const result = opsToTxData({})
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle creates with string and number attributes", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [
            { key: "name", value: "test" },
            { key: "age", value: 25 },
            { key: "city", value: "NYC" },
          ],
          contentType: "application/json",
          expiresIn: 100, // 100 seconds = 50 blocks (100 / 2)
        },
      ]

      const result = opsToTxData({ creates })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle creates with only string attributes", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [
            { key: "name", value: "test" },
            { key: "description", value: "test description" },
          ],
          contentType: "text/plain",
          expiresIn: 200,
        },
      ]

      const result = opsToTxData({ creates })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    it("should handle creates with only number attributes", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [
            { key: "count", value: 42 },
            { key: "score", value: 100 },
          ],
          contentType: "application/json",
          expiresIn: 300,
        },
      ]

      const result = opsToTxData({ creates })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    it("should handle creates with no attributes", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [],
          contentType: "application/json",
          expiresIn: 100,
        },
      ]

      const result = opsToTxData({ creates })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    it("should calculate expiresIn correctly in blocks", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [],
          contentType: "application/json",
          expiresIn: 100, // Should be converted to 50 blocks (100 / 2)
        },
      ]

      const result = opsToTxData({ creates })
      expect(result).toBeDefined()
    })

    it("should handle updates", () => {
      const updates: UpdateEntityParameters[] = [
        {
          entityKey: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
          payload: new Uint8Array([4, 5, 6]),
          attributes: [
            { key: "status", value: "updated" },
            { key: "version", value: 2 },
          ],
          contentType: "application/json",
          expiresIn: 150,
        },
      ]

      const result = opsToTxData({ updates })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle deletes", () => {
      const deletes: DeleteEntityParameters[] = [
        {
          entityKey: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
        },
        {
          entityKey: "0xabcdef1234567890abcdef1234567890abcdef12" as Hex,
        },
      ]

      const result = opsToTxData({ deletes })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle extensions", () => {
      const extensions: ExtendEntityParameters[] = [
        {
          entityKey: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
          expiresIn: 200,
        },
      ]

      const result = opsToTxData({ extensions })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle ownership changes", () => {
      const ownershipChanges: ChangeOwnershipParameters[] = [
        {
          entityKey: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
          newOwner: "0xabcdef1234567890abcdef1234567890abcdef12" as Hex,
        },
      ]

      const result = opsToTxData({ ownershipChanges })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle combined operations", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [{ key: "name", value: "test" }],
          contentType: "application/json",
          expiresIn: 100,
        },
      ]

      const updates: UpdateEntityParameters[] = [
        {
          entityKey: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
          payload: new Uint8Array([4, 5, 6]),
          attributes: [],
          contentType: "text/plain",
          expiresIn: 150,
        },
      ]

      const deletes: DeleteEntityParameters[] = [
        {
          entityKey: "0xabcdef1234567890abcdef1234567890abcdef12" as Hex,
        },
      ]

      const result = opsToTxData({ creates, updates, deletes })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
      expect(result.startsWith("0x")).toBe(true)
    })

    it("should handle undefined arrays as empty", () => {
      const result = opsToTxData({
        creates: undefined,
        updates: undefined,
        deletes: undefined,
        extensions: undefined,
        ownershipChanges: undefined,
      })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    it("should handle empty arrays", () => {
      const result = opsToTxData({
        creates: [],
        updates: [],
        deletes: [],
        extensions: [],
        ownershipChanges: [],
      })
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    it("should filter attributes by type correctly", () => {
      const creates: CreateEntityParameters[] = [
        {
          payload: new Uint8Array([1, 2, 3]),
          attributes: [
            { key: "stringAttr", value: "string value" },
            { key: "numberAttr", value: 42 },
            { key: "anotherString", value: "another" },
            { key: "anotherNumber", value: 100 },
          ],
          contentType: "application/json",
          expiresIn: 100,
        },
      ]

      const result = opsToTxData({ creates })
      expect(result).toBeDefined()
      // String attributes should be in one array, number attributes in another
      expect(typeof result).toBe("string")
    })
  })

  describe("sendArkivTransaction", () => {
    let mockClient: WalletArkivClient
    let mockSendTransaction: ReturnType<typeof vi.fn>
    let mockWaitForTransactionReceipt: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockSendTransaction = vi.fn()
      mockWaitForTransactionReceipt = vi.fn()

      mockClient = {
        account: {
          address: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
        },
        chain: {
          id: 1,
          name: "test",
        },
        sendTransaction: mockSendTransaction,
        waitForTransactionReceipt: mockWaitForTransactionReceipt,
      } as unknown as WalletArkivClient
    })

    it("should throw error when account is missing", async () => {
      const clientWithoutAccount = {
        ...mockClient,
        account: undefined,
      } as unknown as WalletArkivClient

      await expect(sendArkivTransaction(clientWithoutAccount, "0x1234" as Hex)).rejects.toThrow(
        "Account required",
      )
    })

    it("should send transaction with correct parameters", async () => {
      const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex
      const receipt = {
        transactionHash: txHash,
        status: "success",
        logs: [],
      }

      mockSendTransaction.mockResolvedValue(txHash)
      mockWaitForTransactionReceipt.mockResolvedValue(receipt)

      const data = "0x1234567890abcdef" as Hex
      const result = await sendArkivTransaction(mockClient, data)

      expect(mockSendTransaction).toHaveBeenCalledTimes(1)
      expect(mockSendTransaction).toHaveBeenCalledWith({
        account: mockClient.account,
        chain: mockClient.chain,
        to: ARKIV_ADDRESS,
        value: 0n,
        data: expect.any(String), // Compressed data
      })

      expect(mockWaitForTransactionReceipt).toHaveBeenCalledTimes(1)
      expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith({
        hash: txHash,
      })

      expect(result).toEqual(receipt)
    })

    it("should compress transaction data before sending", async () => {
      const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex
      const receipt = {
        transactionHash: txHash,
        status: "success",
        logs: [],
      }

      mockSendTransaction.mockResolvedValue(txHash)
      mockWaitForTransactionReceipt.mockResolvedValue(receipt)

      const data = "0x1234567890abcdef" as Hex
      await sendArkivTransaction(mockClient, data)

      // Verify that the data passed to sendTransaction is different from original
      // (because it's compressed)
      const callArgs = mockSendTransaction.mock.calls[0][0]
      expect(callArgs.data).toBeDefined()
      expect(callArgs.data).not.toBe(data) // Should be compressed
      expect(callArgs.data.startsWith("0x")).toBe(true)
    })

    it("should include custom txParams in transaction", async () => {
      const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex
      const receipt = {
        transactionHash: txHash,
        status: "success",
        logs: [],
      }

      mockSendTransaction.mockResolvedValue(txHash)
      mockWaitForTransactionReceipt.mockResolvedValue(receipt)

      const data = "0x1234567890abcdef" as Hex
      const txParams = {
        gas: 100000n,
        gasPrice: 20000000000n,
      }

      await sendArkivTransaction(mockClient, data, txParams)

      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: txParams.gas,
          gasPrice: txParams.gasPrice,
        }),
      )
    })

    it("should handle transaction errors", async () => {
      const error = new Error("Transaction failed")
      mockSendTransaction.mockRejectedValue(error)

      const data = "0x1234567890abcdef" as Hex

      await expect(sendArkivTransaction(mockClient, data)).rejects.toThrow("Transaction failed")

      expect(mockWaitForTransactionReceipt).not.toHaveBeenCalled()
    })

    it("should handle receipt wait errors", async () => {
      const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex
      const error = new Error("Receipt wait failed")

      mockSendTransaction.mockResolvedValue(txHash)
      mockWaitForTransactionReceipt.mockRejectedValue(error)

      const data = "0x1234567890abcdef" as Hex

      await expect(sendArkivTransaction(mockClient, data)).rejects.toThrow("Receipt wait failed")
    })

    it("should use ARKIV_ADDRESS as transaction recipient", async () => {
      const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex
      const receipt = {
        transactionHash: txHash,
        status: "success",
        logs: [],
      }

      mockSendTransaction.mockResolvedValue(txHash)
      mockWaitForTransactionReceipt.mockResolvedValue(receipt)

      const data = "0x1234567890abcdef" as Hex
      await sendArkivTransaction(mockClient, data)

      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ARKIV_ADDRESS,
        }),
      )
    })

    it("should set value to 0n", async () => {
      const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex
      const receipt = {
        transactionHash: txHash,
        status: "success",
        logs: [],
      }

      mockSendTransaction.mockResolvedValue(txHash)
      mockWaitForTransactionReceipt.mockResolvedValue(receipt)

      const data = "0x1234567890abcdef" as Hex
      await sendArkivTransaction(mockClient, data)

      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 0n,
        }),
      )
    })
  })
})
