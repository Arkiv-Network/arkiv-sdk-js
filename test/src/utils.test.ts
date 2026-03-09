import { describe, expect, test } from "bun:test"

import { getArkivLocalhostRpcUrls, getArkivRpcUrls, getArkivTestNetwork } from "./utils.js"

describe("test utils", () => {
  test("getArkivRpcUrls keeps websocket optional", () => {
    expect(getArkivRpcUrls("http://localhost:7777")).toEqual({
      default: {
        http: ["http://localhost:7777"],
      },
    })
  })

  test("getArkivLocalhostRpcUrls returns both localhost transports", () => {
    expect(getArkivLocalhostRpcUrls(8545, 8546)).toEqual({
      default: {
        http: ["http://127.0.0.1:8545"],
        webSocket: ["ws://127.0.0.1:8546"],
      },
    })
  })

  test("getArkivTestNetwork uses localhost test chain metadata", () => {
    expect(getArkivTestNetwork("http://localhost:7777")).toEqual({
      id: 1337,
      name: "Localhost",
      nativeCurrency: {
        decimals: 18,
        name: "Ether",
        symbol: "ETH",
      },
      rpcUrls: {
        default: {
          http: ["http://localhost:7777"],
        },
      },
    })
  })
})
