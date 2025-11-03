import { expect, test, vi } from "bun:test"
import { createTransport, type EIP1193RequestFn } from "viem"
import { createPublicClient } from "./createPublicClient"

const mockTransport = () =>
  createTransport({
    key: "mock",
    name: "Mock Transport",
    request: vi.fn(() => null) as unknown as EIP1193RequestFn,
    type: "mock",
  })

test("creates", () => {
  const { uid, ...client } = createPublicClient({
    transport: mockTransport,
  })

  expect(uid).toBeDefined()
  expect(client.getEntity).toBeDefined()
  expect(typeof client.getEntity).toBe("function")
  expect(client.createEntity).not.toBeDefined()
})
