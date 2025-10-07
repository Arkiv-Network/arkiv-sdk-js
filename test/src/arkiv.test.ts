import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Hex, PublicArkivClient, WalletArkivClient } from "arkiv"
import { createPublicClient, createWalletClient, http, toBytes } from "arkiv"
import { privateKeyToAccount } from "arkiv/accounts"
import type { StartedTestContainer } from "testcontainers"
import { getArkivLocalhostRpcUrls, launchLocalArkivNode } from "./utils"

describe("Arkiv Integration Tests for public client", () => {
	let arkivNode: StartedTestContainer
	let publicClient: PublicArkivClient
	let walletClient: WalletArkivClient
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
		walletClient = createWalletClient({
			transport: http(),
			chain: localTestNetwork,
			account: privateKeyToAccount(privateKey),
		})
	})

	afterAll(async () => {
		if (arkivNode) {
			await arkivNode.stop()
		}
	})

	test("should get chain ID", async () => {
		const chainId = await publicClient.getChainId()
		expect(chainId).toBeDefined()
		expect(chainId).toBe(1337)
	})

	test("should get block number", async () => {
		const blockNumber = await publicClient.getBlockNumber()
		expect(blockNumber).toBeDefined()
		expect(typeof blockNumber).toBe("bigint")
		expect(blockNumber).toBeGreaterThanOrEqual(0n)
	})

	test("should call getEntity with existing key", async () => {
		// First, let's try to store some data if the container supports it
		// For now, we'll test with a key that might exist or return null/undefined
		const testKey = "0x567b6b2dfe0d9f87f054b9e3282a579630cab0b011643c4912f3b8b172b14fb7"

		const entity = await publicClient.getEntity(testKey)

		// The result could be null, undefined, or an actual entity
		// depending on whether the key exists and what the RPC returns
		expect(entity).toBeDefined()
		// TODO expect some value
	})

	test("should handle getEntity with non-existent key", async () => {
		const nonExistentKey = "0x567b6b2dfe0d9f87f054b9e3282a579630cab0b011643c4912f3b8b172b14fb7"

		try {
			const entity = await publicClient.getEntity(nonExistentKey)
			expect(entity).toBeNull()
		} catch (error) {
			console.log("getEntity error for non-existent key:", error)
			expect(error).toBeDefined()
		}
	})

	test("should handle basic CRUD operations", async () => {
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
		const entity = await publicClient.getEntity(entityKey)
		console.log("entity from getEntity", entity)
		expect(entity).toBeDefined()
		expect(entity.payload).toEqual(
			toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
		)
		expect(entity.annotations).toEqual([{ key: "testKey", value: "testValue" }])

		// update entity
		const { entityKey: updatedEntityKey, txHash: updatedTxHash } = await walletClient.updateEntity({
			entityKey,
			payload: toBytes(JSON.stringify({ entity: { entityType: "test2", entityId: "test2" } })),
			annotations: [],
			btl: 1000,
		})
		console.log("result from updateEntity", { updatedEntityKey, updatedTxHash })

		// get entity
		const updatedEntity = await walletClient.getEntity(updatedEntityKey)
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
		const { entityKey: deletedEntityKey, txHash: deletedTxHash } = await walletClient.deleteEntity({
			entityKey: extendedEntityKey,
		})
		console.log("result from deleteEntity", { deletedEntityKey, deletedTxHash })
	})
})
