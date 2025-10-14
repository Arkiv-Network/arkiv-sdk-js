import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Hex, PublicArkivClient, WalletArkivClient } from "arkiv"
import { createPublicClient, createWalletClient, http, toBytes, webSocket } from "arkiv"
import { privateKeyToAccount } from "arkiv/accounts"
import { eq } from "arkiv/query"
import { jsonToPayload } from "arkiv/utils"
import type { StartedTestContainer } from "testcontainers"
import { PollingWatchKind } from "typescript"
import { execCommand, getArkivLocalhostRpcUrls, launchLocalArkivNode } from "./utils"

describe("Arkiv Integration Tests for public client", () => {
	let arkivNode: StartedTestContainer
	let publicClient: PublicArkivClient
	let publicClientWS: PublicArkivClient
	let walletClient: WalletArkivClient
	let walletClientWS: WalletArkivClient
	const privateKey = process.env.PRIVATE_KEY as Hex

	beforeAll(async () => {
		// Start GolemDB container
		const { container, httpPort, wsPort } = await launchLocalArkivNode(privateKey)
		arkivNode = container
		const localTestNetwork = {
			id: 1337,
			name: "Localhost",
			nativeCurrency: {
				decimals: 18,
				name: "Ether",
				symbol: "ETH",
			},
			rpcUrls: getArkivLocalhostRpcUrls(httpPort, wsPort),
		}

		// Create the public client
		publicClient = createPublicClient({
			transport: http(),
			chain: localTestNetwork,
		})
		publicClientWS = createPublicClient({
			transport: webSocket(),
			chain: localTestNetwork,
		})
		walletClient = createWalletClient({
			transport: http(),
			chain: localTestNetwork,
			account: privateKeyToAccount(privateKey),
		})
		walletClientWS = createWalletClient({
			transport: webSocket(),
			chain: localTestNetwork,
			account: privateKeyToAccount(privateKey),
		})
	})

	afterAll(async () => {
		if (arkivNode) {
			await arkivNode.stop()
		}
	})

	test.each(["http", "webSocket"] as const)("should get chain ID using %s", async (transport) => {
		const client = transport === "http" ? publicClient : publicClientWS
		const chainId = await client.getChainId()
		expect(chainId).toBeDefined()
		expect(chainId).toBe(1337)
	})

	test.each(["http", "webSocket"] as const)(
		"should get block number using %s",
		async (transport) => {
			const client = transport === "http" ? publicClient : publicClientWS
			const blockNumber = await client.getBlockNumber()
			expect(blockNumber).toBeDefined()
			expect(typeof blockNumber).toBe("bigint")
			expect(blockNumber).toBeGreaterThanOrEqual(0n)
		},
	)

	test.each(["http", "webSocket"] as const)(
		"should call getEntity with existing key using %s",
		async (transport) => {
			const client = transport === "http" ? publicClient : publicClientWS
			// First, let's try to store some data if the container supports it
			const result = await execCommand(arkivNode, [
				"golembase",
				"entity",
				"create",
				"--data",
				"Hello world",
			])
			// extract the key from result - Entity created key 0xb86bbe79ac65ce938f622ce1a01740a2067cda60bba74e40b9358ae29b4b4668
			const testKey = result.match(/Entity created key (.*)/)?.[1] as Hex
			expect(testKey).toBeDefined()

			const entity = await client.getEntity(testKey)

			// The result could be null, undefined, or an actual entity
			// depending on whether the key exists and what the RPC returns
			expect(entity).toBeDefined()
			// TODO expect some value
		},
	)

	test.each(["http", "webSocket"] as const)(
		"should handle getEntity with non-existent key using %s",
		async (transport) => {
			const client = transport === "http" ? publicClient : publicClientWS
			const nonExistentKey = "0x567b6b2dfe0d9f87f054b9e3282a579630cab0b011643c4912f3b8b172b14fb7"

			try {
				const entity = await client.getEntity(nonExistentKey)
				expect(entity).toBeNull()
			} catch (error) {
				console.log("getEntity error for non-existent key:", error)
				expect(error).toBeDefined()
			}
		},
	)

	test.each(["http", "webSocket"] as const)("should handle query using %s", async (transport) => {
		const client = transport === "http" ? publicClient : publicClientWS
		// First, let's try to store some data if the container supports it
		const result = await execCommand(arkivNode, [
			"golembase",
			"entity",
			"create",
			"--data",
			"Hello world",
			"--string",
			"key:value",
			"--btl",
			"1000",
		])
		// extract the key from result - Entity created key 0xb86bbe79ac65ce938f622ce1a01740a2067cda60bba74e40b9358ae29b4b4668
		const testKey = result.match(/Entity created key (.*)/)?.[1] as Hex
		expect(testKey).toBeDefined()

		// build query
		const query = client.buildQuery()
		const entities = await query
			.where(eq("key", "value"))
			.ownedBy(privateKeyToAccount(privateKey).address)
			.fetch()
		expect(entities).toBeDefined()
		expect(entities.entities.length).toBeGreaterThanOrEqual(1)

		// raw query
		const rawQuery = await client.query(
			`key = "value" && $owner = "${privateKeyToAccount(privateKey).address}"`,
		)
		expect(rawQuery).toBeDefined()
		expect(rawQuery.length).toBeGreaterThanOrEqual(1)
	})

	test.each(["http", "webSocket"] as const)(
		"should handle basic CRUD operations using %s",
		async (transport) => {
			const client = transport === "http" ? walletClient : walletClientWS

			// subscribe to entity events
			const unsubscribe = await client.subscribeEntityEvents(
				{
					onError: (error) => console.error("subscribeEntityEvents error", error),
				},
				10,
			)

			// create entity
			const { entityKey, txHash } = await walletClient.createEntity({
				payload: toBytes(
					JSON.stringify({
						entity: {
							entityType: "test",
							entityId: "test",
						},
					}),
				),
				annotations: [{ key: "testKey", value: "testValue" }],
				btl: 1000,
			})
			console.log("result from createEntity", { entityKey, txHash })

			// get entity
			const entity = await client.getEntity(entityKey)
			console.log("entity from getEntity", entity)
			expect(entity).toBeDefined()
			expect(entity.payload).toEqual(
				toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
			)
			expect(entity.annotations).toEqual([{ key: "testKey", value: "testValue" }])

			// update entity
			const { entityKey: updatedEntityKey, txHash: updatedTxHash } = await client.updateEntity({
				entityKey,
				payload: jsonToPayload({ entity: { entityType: "test2", entityId: "test2" } }),
				annotations: [],
				btl: 1000,
			})
			console.log("result from updateEntity", { updatedEntityKey, updatedTxHash })

			// get entity
			const updatedEntity = await client.getEntity(updatedEntityKey)
			console.log("entity from getEntity", updatedEntity)
			expect(updatedEntity).toBeDefined()
			expect(updatedEntity.payload).toEqual(
				toBytes(JSON.stringify({ entity: { entityType: "test2", entityId: "test2" } })),
			)
			expect(updatedEntity.annotations).toEqual([])

			// extend entity
			const { entityKey: extendedEntityKey, txHash: extendedTxHash } =
				await walletClient.extendEntity({
					entityKey: updatedEntityKey,
					btl: 1000,
				})
			console.log("result from extendEntity", { extendedEntityKey, extendedTxHash })
			expect(extendedEntityKey).toBeDefined()
			expect(extendedTxHash).toBeDefined()

			// delete entity
			const { entityKey: deletedEntityKey, txHash: deletedTxHash } = await client.deleteEntity({
				entityKey: updatedEntityKey,
			})
			console.log("result from deleteEntity", { deletedEntityKey, deletedTxHash })

			// unsubscribe from entity events
			unsubscribe()
		},
		{ timeout: 20000 },
	)
})
