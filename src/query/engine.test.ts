import { describe, expect, it, jest } from "bun:test"
import type { ArkivClient } from "../clients/baseClient"
import { processQuery } from "./engine"
import type { Predicate } from "./predicate"

describe("processQuery tests", () => {
	const client = {
		request: jest.fn(),
	} as unknown as ArkivClient

	it("should process single predicate", async () => {
		const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: undefined,
			validBeforeBlock: undefined,
			withAnnotations: undefined,
			withMetadata: undefined,
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [`key = "value"`],
		})
	})

	it("should process all simple predicates - flat", async () => {
		const predicates = [
			{ type: "eq" as const, key: "key", value: "value" },
			{ type: "gt" as const, key: "key2", value: 1 },
			{ type: "gte" as const, key: "key3", value: 2 },
			{ type: "lt" as const, key: "key4", value: 3 },
			{ type: "lte" as const, key: "key5", value: 4 },
			{ type: "neq" as const, key: "key6", value: "value6" },
		]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: undefined,
			validBeforeBlock: undefined,
			withAnnotations: undefined,
			withMetadata: undefined,
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [
				`key = "value" && key2 > 1 && key3 >= 2 && key4 < 3 && key5 <= 4 && key6 != "value6"`,
			],
		})
	})

	it("should process multiple predicates - nested with or", async () => {
		const predicates = [
			{ type: "eq" as const, key: "key", value: "value" },
			{
				type: "or" as const,
				predicates: [
					{ type: "eq" as const, key: "key2", value: "value2" },
					{ type: "eq" as const, key: "key3", value: "value3" },
				],
			},
		]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: undefined,
			validBeforeBlock: undefined,
			withAnnotations: undefined,
			withMetadata: undefined,
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [`key = "value" && (key2 = "value2" || key3 = "value3")`],
		})
	})

	it("should process multiple predicates - nested with and", async () => {
		const predicates = [
			{ type: "eq" as const, key: "key", value: "value" },
			{
				type: "and" as const,
				predicates: [
					{ type: "eq" as const, key: "key2", value: "value2" },
					{ type: "eq" as const, key: "key3", value: "value3" },
				],
			},
		]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: undefined,
			validBeforeBlock: undefined,
			withAnnotations: undefined,
			withMetadata: undefined,
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [`key = "value" && (key2 = "value2" && key3 = "value3")`],
		})
	})

	it("should process multiple predicates - nested with and and or", async () => {
		const predicates = [
			{ type: "eq" as const, key: "key", value: "value" },
			{
				type: "and" as const,
				predicates: [
					{ type: "eq" as const, key: "key2", value: "value2" },
					{
						type: "or" as const,
						predicates: [
							{ type: "eq" as const, key: "key3", value: "value3" },
							{ type: "eq" as const, key: "key4", value: "value4" },
						],
					},
				],
			},
		]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: undefined,
			validBeforeBlock: undefined,
			withAnnotations: undefined,
			withMetadata: undefined,
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [`key = "value" && (key2 = "value2" && (key3 = "value3" || key4 = "value4"))`],
		})
	})

	it("should process simple predicates with ownedBy", async () => {
		const predicates = [{ type: "eq" as const, key: "key", value: "value" }]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: "0x123",
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [`key = "value" && $owner="0x123"`],
		})
	})

	it("should process only ownedBy", async () => {
		const predicates = [] as Predicate[]
		await processQuery(client, {
			predicates,
			limit: undefined,
			offset: undefined,
			ownedBy: "0x123",
		})

		expect(client.request).lastCalledWith({
			method: "golembase_queryEntities",
			params: [`$owner="0x123"`],
		})
	})
})
