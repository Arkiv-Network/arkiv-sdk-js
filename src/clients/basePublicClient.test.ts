import { describe, expect, it } from "bun:test";
import { http } from "viem";
import { sepolia } from "viem/chains";
import { createPublicClient } from "./createPublicClient";

describe("basePublicClient", () => {
	it("should be defined", () => {
		const client = createPublicClient({
			chain: sepolia,
			transport: http(),
		});

		expect(client).toBeDefined();
		expect(client.getEntityByKey).toBeDefined();
	});
});
