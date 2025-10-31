import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Hex, PublicArkivClient, WalletArkivClient } from "arkiv"
import { createPublicClient, createWalletClient, http, toBytes, webSocket } from "arkiv"
import { privateKeyToAccount } from "arkiv/accounts"
import { eq } from "arkiv/query"
import { ExpirationTime, jsonToPayload } from "arkiv/utils"
import type { StartedTestContainer } from "testcontainers"
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
		"should get entity count using %s",
		async (transport) => {
			const client = transport === "http" ? publicClient : publicClientWS
			const entityCount = await client.getEntityCount()
			console.log("entityCount", entityCount)
			expect(entityCount).toBeDefined()
			expect(entityCount).toEqual(0)
		},
	)

	test.each(["http", "webSocket"] as const)(
		"should get block timing using %s",
		async (transport) => {
			const client = transport === "http" ? publicClient : publicClientWS
			const blockTiming = await client.getBlockTiming()
			console.log("blockTiming", blockTiming)
			expect(blockTiming).toBeDefined()
			expect(blockTiming.currentBlock).toBeDefined()
			expect(blockTiming.currentBlock).toBeGreaterThan(0n)
			expect(blockTiming.currentBlockTime).toBeDefined()
			expect(blockTiming.currentBlockTime).toBeGreaterThan(0)
			expect(blockTiming.blockDuration).toBeDefined()
			expect(blockTiming.blockDuration).toBeGreaterThan(0)
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
			`key = "value" && $owner = ${privateKeyToAccount(privateKey).address}`,
		)
		expect(rawQuery).toBeDefined()
		expect(rawQuery.length).toBeGreaterThanOrEqual(1)

		// query at specific block
		const queryAtBlock = await client
			.buildQuery()
			.where(eq("key", "value"))
			.validAtBlock(1n)
			.fetch()
		expect(queryAtBlock).toBeDefined()
		expect(queryAtBlock.entities.length).toBeGreaterThanOrEqual(0)
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
				contentType: "application/json",
				annotations: [{ key: "testKey", value: "testValue" }],
				expiresIn: ExpirationTime.fromBlocks(1000),
			})
			console.log("result from createEntity", { entityKey, txHash })
			const entityCount = await client.getEntityCount()
			expect(entityCount).toBeGreaterThanOrEqual(1)

			// get entity
			const entity = await client.getEntity(entityKey)
			console.log("entity from getEntity", entity)
			expect(entity).toBeDefined()
			expect(entity.payload).toEqual(
				toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
			)
			expect(entity.annotations.length).toEqual(1)

			// update entity
			const { entityKey: updatedEntityKey, txHash: updatedTxHash } = await client.updateEntity({
				entityKey,
				payload: jsonToPayload({ entity: { entityType: "test2", entityId: "test2" } }),
				contentType: "application/json",
				annotations: [],
				expiresIn: 1000,
			})
			console.log("result from updateEntity", { updatedEntityKey, updatedTxHash })

			// get entity
			const updatedEntity = await client.getEntity(updatedEntityKey)
			console.log("entity from getEntity", updatedEntity)
			expect(updatedEntity).toBeDefined()
			expect(updatedEntity.payload).toEqual(
				toBytes(JSON.stringify({ entity: { entityType: "test2", entityId: "test2" } })),
			)
			expect(updatedEntity.annotations.length).toEqual(0)

			// extend entity
			const { entityKey: extendedEntityKey, txHash: extendedTxHash } =
				await walletClient.extendEntity({
					entityKey: updatedEntityKey,
					expiresIn: 1000,
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

	test.each(["http", "webSocket"] as const)(
		"should handle mutateEntities using %s",
		async (transport) => {
			const client = transport === "http" ? walletClient : walletClientWS

			// need to create a few entities first
			const { entityKey: entityKey1, txHash: txHash1 } = await client.createEntity({
				payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
				contentType: "application/json",
				annotations: [{ key: "testKey", value: "testValue" }],
				expiresIn: 1000,
			})

			const { entityKey: entityKey2, txHash: txHash2 } = await client.createEntity({
				payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
				contentType: "application/json",
				annotations: [{ key: "testKey", value: "testValue" }],
				expiresIn: 1000,
			})

			const { entityKey: entityKey3, txHash: txHash3 } = await client.createEntity({
				payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
				contentType: "application/json",
				annotations: [{ key: "testKey", value: "testValue" }],
				expiresIn: 1000,
			})

			const { entityKey: entityKey4, txHash: txHash4 } = await client.createEntity({
				payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
				contentType: "application/json",
				annotations: [{ key: "testKey", value: "testValue" }],
				expiresIn: 1000,
			})

			// mutate entities using various operations
			const result = await client.mutateEntities({
				creates: [
					{
						payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
						contentType: "application/json",
						annotations: [{ key: "testKey", value: "testValue" }],
						expiresIn: 1000,
					},
				],
				updates: [
					{
						entityKey: entityKey1,
						payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
						contentType: "application/json",
						annotations: [{ key: "testKey", value: "testValue" }],
						expiresIn: 1000,
					},
				],
				deletes: [
					{
						entityKey: entityKey2,
					},
					{
						entityKey: entityKey3,
					},
				],
				extensions: [
					{
						entityKey: entityKey4,
						expiresIn: 1000,
					},
				],
			})
			console.log("result from mutateEntities", result)
			expect(result).toBeDefined()
			expect(result.txHash).toBeDefined()
			expect(result.createdEntities).toBeDefined()
			expect(result.updatedEntities).toBeDefined()
			expect(result.deletedEntities).toBeDefined()
			expect(result.extendedEntities).toBeDefined()
		},
		{ timeout: 60000 },
	)

	test.each(["http", "webSocket"] as const)(
		"should handle query with pagination using",
		async (transport) => {
			const client = transport === "http" ? walletClient : walletClientWS
			const value = transport === "http" ? "testValuePaging" : "testValuePagingWS"
			// create 10 entities
			for (let i = 0; i < 10; i++) {
				await client.createEntity({
					payload: toBytes(JSON.stringify({ entity: { entityType: "test", entityId: "test" } })),
					contentType: "application/json",
					annotations: [{ key: "testKey", value }],
					expiresIn: 1000,
				})
			}

			// query with pagination - irregular number of entities (6,4)
			const query = client.buildQuery()
			const queryResult = await query
				.where(eq("testKey", value))
				.limit(6)
				.ownedBy(privateKeyToAccount(privateKey).address)
				.fetch()
			expect(queryResult).toBeDefined()
			expect(queryResult.entities).toBeDefined()
			expect(queryResult.entities.length).toEqual(6)

			// fetch next page
			await queryResult.next()
			expect(queryResult.entities).toBeDefined()
			expect(queryResult.entities.length).toEqual(4)

			// and there is no more results
			await expect(queryResult.next()).rejects.toThrow()

			// query with pagination - irregular number of entities (5,5)
			const query2 = client.buildQuery()
			const queryResult2 = await query2
				.where(eq("testKey", value))
				.limit(5)
				.ownedBy(privateKeyToAccount(privateKey).address)
				.fetch()
			expect(queryResult2).toBeDefined()
			expect(queryResult2.entities).toBeDefined()
			expect(queryResult2.entities.length).toEqual(5)

			// fetch next page
			await queryResult2.next()
			expect(queryResult2.entities).toBeDefined()
			expect(queryResult2.entities.length).toEqual(5)

			// and there is no more results
			await expect(queryResult.next()).rejects.toThrow()
		},
		{ timeout: 60000 },
	)
	test.each(["http", "webSocket"] as const)(
		"Query with various projections using withAnnotations, withMetadata, withPayload",
		async (transport) => {
			const client = transport === "http" ? walletClient : walletClientWS
			// create entity
			await walletClient.createEntity({
				payload: jsonToPayload({
					entity: {
						entityType: "test",
						entityId: "test",
					},
				}),
				contentType: "application/json",
				annotations: [{ key: "testKey", value: "testValue" }],
				expiresIn: ExpirationTime.fromBlocks(1000),
			})

			// query with no data fetched - just key (it is always fetched)
			let queryResult = await client.buildQuery().where(eq("testKey", "testValue")).fetch()
			expect(queryResult).toBeDefined()
			expect(queryResult.entities.length).toBeGreaterThanOrEqual(1)
			expect(queryResult.entities[0].owner).toBeUndefined()
			expect(queryResult.entities[0].payload).toHaveLength(0)
			expect(queryResult.entities[0].annotations).toHaveLength(0)
			expect(queryResult.entities[0].expiresAtBlock).toBeUndefined()

			// query with payload only
			queryResult = await client
				.buildQuery()
				.where(eq("testKey", "testValue"))
				.withAnnotations(false)
				.withMetadata(false)
				.withPayload(true)
				.fetch()
			expect(queryResult).toBeDefined()
			expect(queryResult.entities.length).toBeGreaterThanOrEqual(1)
			expect(queryResult.entities[0].payload.length).toBeGreaterThan(0)

			// query with metadata only
			queryResult = await client
				.buildQuery()
				.where(eq("testKey", "testValue"))
				.withAnnotations(false)
				.withMetadata(true)
				.withPayload(false)
				.fetch()
			expect(queryResult).toBeDefined()
			expect(queryResult.entities.length).toBeGreaterThanOrEqual(1)
			expect(queryResult.entities[0].owner).toBeDefined()
			expect(queryResult.entities[0].expiresAtBlock).toBeDefined()

			// query with annotations only
			queryResult = await client
				.buildQuery()
				.where(eq("testKey", "testValue"))
				.withAnnotations(true)
				.withMetadata(false)
				.withPayload(false)
				.fetch()
			expect(queryResult).toBeDefined()
			expect(queryResult.entities[0].annotations.length).toBeGreaterThanOrEqual(1)
		},
		{ timeout: 20000 },
	)
})
