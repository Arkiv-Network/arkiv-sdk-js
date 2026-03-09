import { afterEach, describe, expect, test } from "bun:test"
import { getArkivTestRpcUrls } from "./utils.js"

const originalRpcUrl = process.env.ARKIV_SDK_TEST_RPC_URL
const originalWsUrl = process.env.ARKIV_SDK_TEST_WS_URL

afterEach(() => {
  if (originalRpcUrl === undefined) {
    delete process.env.ARKIV_SDK_TEST_RPC_URL
  } else {
    process.env.ARKIV_SDK_TEST_RPC_URL = originalRpcUrl
  }

  if (originalWsUrl === undefined) {
    delete process.env.ARKIV_SDK_TEST_WS_URL
  } else {
    process.env.ARKIV_SDK_TEST_WS_URL = originalWsUrl
  }
})

describe("getArkivTestRpcUrls", () => {
  test("uses external test network URLs when both env vars are set", () => {
    process.env.ARKIV_SDK_TEST_RPC_URL = "http://localhost:7777"
    process.env.ARKIV_SDK_TEST_WS_URL = "ws://localhost:7778"

    expect(getArkivTestRpcUrls()).toEqual({
      default: {
        http: ["http://localhost:7777"],
        webSocket: ["ws://localhost:7778"],
      },
    })
  })

  test("falls back to mapped localhost ports when env vars are not set", () => {
    delete process.env.ARKIV_SDK_TEST_RPC_URL
    delete process.env.ARKIV_SDK_TEST_WS_URL

    expect(getArkivTestRpcUrls({ httpPort: 7777, wsPort: 7778 })).toEqual({
      default: {
        http: ["http://127.0.0.1:7777"],
        webSocket: ["ws://127.0.0.1:7778"],
      },
    })
  })

  test("requires both external test network env vars when either is set", () => {
    process.env.ARKIV_SDK_TEST_RPC_URL = "http://localhost:7777"
    delete process.env.ARKIV_SDK_TEST_WS_URL

    expect(() => getArkivTestRpcUrls()).toThrow(
      "Both ARKIV_SDK_TEST_RPC_URL and ARKIV_SDK_TEST_WS_URL must be set to use an external test network",
    )
  })
})
