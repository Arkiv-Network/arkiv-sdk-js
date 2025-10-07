import { expect, test, vi } from "bun:test"
import { createTransport } from "viem"
import { createWalletClient } from "./createWalletClient"

const mockTransport = () =>
	createTransport({
		key: "mock",
		name: "Mock Transport",
		request: vi.fn(() => null) as any,
		type: "mock",
	})

test("creates", () => {
	const { uid, ...client } = createWalletClient({
		transport: mockTransport,
	})

	expect(uid).toBeDefined()
	expect(client.getEntity).toBeDefined()
	expect(typeof client.getEntity).toBe("function")
	expect(client.createEntity).toBeDefined()
	expect(typeof client.createEntity).toBe("function")
})
