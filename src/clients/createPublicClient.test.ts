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
  expect(client.select).toBeDefined()
  expect(typeof client.select).toBe("function")
  expect(client.query).toBeDefined()
  expect(typeof client.query).toBe("function")
  expect(client.getBlockTiming).toBeDefined()
  expect(typeof client.getBlockTiming).toBe("function")
  expect(client.watchEntityEvents).toBeDefined()
  expect(typeof client.watchEntityEvents).toBe("function")
  expect(client.watchEvent).toBeDefined()
  expect(typeof client.watchEvent).toBe("function")
  expect(client.createEntity).not.toBeDefined()
  expect(client.patchEntity).not.toBeDefined()
  expect(client.deleteEntity).not.toBeDefined()
  expect(client.extendEntity).not.toBeDefined()
  expect(client.changeOwnership).not.toBeDefined()
  expect(client.executeBatch).not.toBeDefined()
})

test("select() rejects a $ name that is not an entity field, at compile time and at runtime", () => {
  const client = createPublicClient({ transport: mockTransport })
  // @ts-expect-error - $title is not an entity field; an attribute name cannot start with $
  expect(() => client.select({ $title: true })).toThrow(/not an entity field/)
  // @ts-expect-error - $attributes reads every attribute; select the ones you want by name
  expect(() => client.select({ $attributes: { title: true } })).toThrow(/select each by name/)
  // Without the $, `owner` is an attribute like any other, read alongside the entity field.
  expect(() => client.select({ $owner: true, owner: true })).not.toThrow()
})
