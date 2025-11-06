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
  expect(client.buildQuery).toBeDefined()
  expect(typeof client.buildQuery).toBe("function")
  expect(client.query).toBeDefined()
  expect(typeof client.query).toBe("function")
  expect(client.getEntityCount).toBeDefined()
  expect(typeof client.getEntityCount).toBe("function")
  expect(client.getBlockTiming).toBeDefined()
  expect(typeof client.getBlockTiming).toBe("function")
  expect(client.subscribeEntityEvents).toBeDefined()
  expect(typeof client.subscribeEntityEvents).toBe("function")
  expect(client.watchEvent).toBeDefined()
  expect(typeof client.watchEvent).toBe("function")
  expect(client.createEntity).not.toBeDefined()
  expect(client.updateEntity).not.toBeDefined()
  expect(client.deleteEntity).not.toBeDefined()
  expect(client.extendEntity).not.toBeDefined()
  expect(client.changeOwnership).not.toBeDefined()
  expect(client.mutateEntities).not.toBeDefined()
})
