import { expect, test, vi } from "bun:test"
import { createTransport } from "viem"
import { createPublicClient } from "./createPublicClient"

const mockTransport = () =>
	createTransport({
		key: "mock",
		name: "Mock Transport",
		request: vi.fn(() => null) as any,
		type: "mock",
	})

test("creates", () => {
	const { uid, ...client } = createPublicClient({
		transport: mockTransport,
	})

	expect(uid).toBeDefined()
	expect(client.getEntityByKey).toBeDefined()
	expect(typeof client.getEntityByKey).toBe("function")
	expect(client.createEntity).not.toBeDefined()
})
