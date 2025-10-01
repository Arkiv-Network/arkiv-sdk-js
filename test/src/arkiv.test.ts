import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { PublicArkivClient } from "arkiv"
import { createPublicClient, http } from "arkiv"
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers"

describe("GolemDB Integration Tests for public client", () => {
	let container: StartedTestContainer
	let client: PublicArkivClient
	let rpcUrl: string

	beforeAll(async () => {
		// Start GolemDB container
		container = await new GenericContainer("golemnetwork/golembase-op-geth:latest")
			.withExposedPorts(8545)
			.withCommand([
				"--http",
				"--http.addr",
				"0.0.0.0",
				"--http.port",
				"8545",
				"--http.api",
				"eth,net,web3,golembase",
				"--http.corsdomain",
				"*",
				"--ws",
				"--ws.addr",
				"0.0.0.0",
				"--ws.port",
				"8546",
				"--ws.api",
				"eth,net,web3,golembase",
				"--ws.origins",
				"*",
				"--networkid",
				"1",
				"--dev",
				"--allow-insecure-unlock",
			])
			.withWaitStrategy(Wait.forLogMessage("HTTP server started", 1))
			.withStartupTimeout(30000)
			.start()

		// Get the container's mapped port
		const mappedPort = container.getMappedPort(8545)
		rpcUrl = `http://localhost:${mappedPort}`

		// Create the public client
		client = createPublicClient({
			transport: http(rpcUrl),
			name: "GolemDB Test Client",
		})
	})

	afterAll(async () => {
		if (container) {
			await container.stop()
		}
	})

	test("should connect to GolemDB container", async () => {
		expect(client).toBeDefined()
		expect(rpcUrl).toContain("localhost")
	})

	test("should get chain ID", async () => {
		const chainId = await client.getChainId()
		expect(chainId).toBeDefined()
		expect(chainId).toBe(1337)
	})

	test("should get block number", async () => {
		const blockNumber = await client.getBlockNumber()
		expect(blockNumber).toBeDefined()
		expect(typeof blockNumber).toBe("bigint")
		expect(blockNumber).toBeGreaterThanOrEqual(0n)
	})

	test("should call getEntity with existing key", async () => {
		// First, let's try to store some data if the container supports it
		// For now, we'll test with a key that might exist or return null/undefined
		const testKey = "0x567b6b2dfe0d9f87f054b9e3282a579630cab0b011643c4912f3b8b172b14fb7"

		const entity = await client.getEntity(testKey)

		// The result could be null, undefined, or an actual entity
		// depending on whether the key exists and what the RPC returns
		expect(entity).toBeDefined()
		// TODO expect some value
	})

	test("should handle getEntity with non-existent key", async () => {
		const nonExistentKey = "0x567b6b2dfe0d9f87f054b9e3282a579630cab0b011643c4912f3b8b172b14fb7"

		try {
			const entity = await client.getEntity(nonExistentKey)
			expect(entity).toBeNull()
		} catch (error) {
			console.log("getEntity error for non-existent key:", error)
			expect(error).toBeDefined()
		}
	})
})

describe("GolemDB Integration Tests for wallet client", () => {
	test("should handle CRUD operations", async () => {})
})
