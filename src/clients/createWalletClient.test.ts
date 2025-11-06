import { expect, test, vi } from "bun:test"
import { createTransport, type EIP1193RequestFn } from "viem"
import { createWalletClient } from "./createWalletClient"

const mockTransport = () =>
  createTransport({
    key: "mock",
    name: "Mock Transport",
    request: vi.fn(() => null) as unknown as EIP1193RequestFn,
    type: "mock",
  })

test("creates", () => {
  const { uid, ...client } = createWalletClient({
    transport: mockTransport,
  })

  expect(uid).toBeDefined()
  expect(client.getEntity).not.toBeDefined()
  expect(client.waitForTransactionReceipt).toBeDefined()
  expect(typeof client.waitForTransactionReceipt).toBe("function")
  expect(client.createEntity).toBeDefined()
  expect(typeof client.createEntity).toBe("function")
  expect(client.updateEntity).toBeDefined()
  expect(typeof client.updateEntity).toBe("function")
  expect(client.deleteEntity).toBeDefined()
  expect(typeof client.deleteEntity).toBe("function")
  expect(client.extendEntity).toBeDefined()
  expect(typeof client.extendEntity).toBe("function")
  expect(client.changeOwnership).toBeDefined()
  expect(typeof client.changeOwnership).toBe("function")
  expect(client.mutateEntities).toBeDefined()
  expect(typeof client.mutateEntities).toBe("function")
})
