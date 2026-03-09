import { describe, expect, test } from "bun:test"
import {
  getArkivTestConfigFromEnv,
  TEST_CHAIN_ID_ENV,
  TEST_CHAIN_NAME_ENV,
  TEST_HTTP_RPC_URL_ENV,
  TEST_WS_RPC_URL_ENV,
} from "./utils.js"

const PRIVATE_KEY =
  "0x049f4de101c81033ab95e057fa3535c131b1da022a1922cd175cf6b63d263892" as const

describe("getArkivTestConfigFromEnv", () => {
  test("requires PRIVATE_KEY to be provided", () => {
    expect(() => getArkivTestConfigFromEnv({})).toThrow("PRIVATE_KEY env var is required")
  })

  test("requires PRIVATE_KEY to be a hex string", () => {
    expect(() =>
      getArkivTestConfigFromEnv({
        PRIVATE_KEY: "not-a-hex-key",
      }),
    ).toThrow("Malformed PRIVATE_KEY: must be a hex string")
  })

  test("defaults to docker-backed tests when no RPC env vars are provided", () => {
    const config = getArkivTestConfigFromEnv({ PRIVATE_KEY })

    expect(config.mode).toBe("docker")
    expect(config.chainId).toBe(1337)
    expect(config.chainName).toBe("Localhost")
    expect(config.transports).toEqual(["http", "webSocket"])
  })

  test("uses externally provided RPC configuration", () => {
    const config = getArkivTestConfigFromEnv({
      PRIVATE_KEY,
      [TEST_HTTP_RPC_URL_ENV]: "https://rpc.example.test",
      [TEST_WS_RPC_URL_ENV]: "wss://rpc.example.test/ws",
      [TEST_CHAIN_ID_ENV]: "84532",
      [TEST_CHAIN_NAME_ENV]: "Custom RPC",
    })

    expect(config.mode).toBe("external")
    if (config.mode !== "external") {
      throw new Error("expected external config")
    }
    expect(config.httpRpcUrl).toBe("https://rpc.example.test")
    expect(config.wsRpcUrl).toBe("wss://rpc.example.test/ws")
    expect(config.chainId).toBe(84532)
    expect(config.chainName).toBe("Custom RPC")
    expect(config.transports).toEqual(["http", "webSocket"])
  })

  test("limits transports to http when only an external http rpc is provided", () => {
    const config = getArkivTestConfigFromEnv({
      PRIVATE_KEY,
      [TEST_HTTP_RPC_URL_ENV]: "https://rpc.example.test",
    })

    expect(config.mode).toBe("external")
    if (config.mode !== "external") {
      throw new Error("expected external config")
    }
    expect(config.transports).toEqual(["http"])
  })

  test("rejects invalid chain ids", () => {
    for (const invalidChainId of ["not-a-number", "0", "-1", "1.5"]) {
      expect(() =>
        getArkivTestConfigFromEnv({
          PRIVATE_KEY,
          [TEST_HTTP_RPC_URL_ENV]: "https://rpc.example.test",
          [TEST_CHAIN_ID_ENV]: invalidChainId,
        }),
      ).toThrow(`${TEST_CHAIN_ID_ENV} must be a positive integer`)
    }
  })
})
