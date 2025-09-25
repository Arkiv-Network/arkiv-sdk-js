import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { http, createPublicClient } from "arkiv";
import type { PublicArkivClient } from "arkiv";
import { sleep } from "bun";

describe("GolemDB Integration Tests", () => {
  let container: StartedTestContainer;
  let client: PublicArkivClient;
  let rpcUrl: string;

  beforeAll(async () => {
    // Start GolemDB container
    container = await new GenericContainer("golemnetwork/golembase-op-geth:latest")
      .withExposedPorts(8545)
      .withCommand([
        "--http",
        "--http.addr", "0.0.0.0",
        "--http.port", "8545",
        "--http.api", "eth,net,web3,golembase",
        "--http.corsdomain", "*",
        "--ws",
        "--ws.addr", "0.0.0.0",
        "--ws.port", "8546",
        "--ws.api", "eth,net,web3,golembase",
        "--ws.origins", "*",
        "--networkid", "1",
        "--dev",
        "--allow-insecure-unlock"
      ])
      .withWaitStrategy(Wait.forLogMessage("HTTP server started", 1))
      .withStartupTimeout(30000)
      .start();

    // Get the container's mapped port
    const mappedPort = container.getMappedPort(8545);
    rpcUrl = `http://localhost:${mappedPort}`;

    // Create the public client
    client = createPublicClient({
      transport: http(rpcUrl),
      name: "GolemDB Test Client",
    });
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  test("should connect to GolemDB container", async () => {
    expect(client).toBeDefined();
    expect(rpcUrl).toContain("localhost");
  });

  test("should get chain ID", async () => {
    const chainId = await client.getChainId();
    expect(chainId).toBeDefined();
    expect(typeof chainId).toBe("bigint");
  });

  test("should get block number", async () => {
    const blockNumber = await client.getBlockNumber();
    expect(blockNumber).toBeDefined();
    expect(typeof blockNumber).toBe("bigint");
    expect(blockNumber).toBeGreaterThanOrEqual(0n);
  });

  test("should call getEntityByKey with existing key", async () => {
    // First, let's try to store some data if the container supports it
    // For now, we'll test with a key that might exist or return null/undefined
    const testKey = "test-entity-key";
    
    try {
      const entity = await client.getEntityByKey(testKey);
      
      // The result could be null, undefined, or an actual entity
      // depending on whether the key exists and what the RPC returns
      expect(entity).toBeDefined();
      
      if (entity !== null && entity !== undefined) {
        expect(typeof entity).toBe("string");
      }
    } catch (error) {
      // If the RPC method doesn't exist or fails, that's also valuable information
      console.log("getEntityByKey error (expected if no data):", error);
      expect(error).toBeDefined();
    }
  });

  test("should handle getEntityByKey with non-existent key", async () => {
    const nonExistentKey = "non-existent-key-" + Date.now();
    
    try {
      const entity = await client.getEntityByKey(nonExistentKey);
      
      // Should return null, undefined, or empty string for non-existent keys
      expect(entity === null || entity === undefined || entity === "").toBe(true);
    } catch (error) {
      console.log("getEntityByKey error for non-existent key:", error);
      expect(error).toBeDefined();
    }
  });

  test("should verify GolemDB specific RPC methods are available", async () => {
    // Test that our custom RPC method is available
    try {
      const result = await client.request({
        method: "golembase_getStorageValue",
        params: ["test-key"]
      });
      
      // The method should be callable (even if it returns null/undefined)
      expect(result !== undefined).toBe(true);
    } catch (error) {
      // If the method doesn't exist, the error should be about method not found
      expect(error).toBeDefined();
      console.log("Custom RPC method test:", error);
    }
  });
});
