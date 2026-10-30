import { describe, expect, spyOn, test } from "bun:test"
import { MissingAccessKeyError } from "../errors"
import { rabdi } from "./rabdi"

describe("rabdi", () => {
  test("puts the access key at the end of every RPC URL", () => {
    const chain = rabdi({ accessKey: "sdk_test" })

    expect(chain.rpcUrls.default.http).toEqual([
      "https://rpc.rabdi.db-chain.testnet.arkiv.network/sdk_test",
    ])
    expect(chain.rpcUrls.default.webSocket).toEqual([
      "wss://rpc.rabdi.db-chain.testnet.arkiv.network/sdk_test",
    ])
  })

  test("escapes the key", () => {
    expect(rabdi({ accessKey: "a/b c" }).rpcUrls.default.http[0]).toBe(
      "https://rpc.rabdi.db-chain.testnet.arkiv.network/a%2Fb%20c",
    )
  })

  test("describes the network", () => {
    const chain = rabdi({ accessKey: "k" })

    expect(chain.id).toBe(7794095)
    expect(chain.name).toBe("Rabdi")
    expect(chain.nativeCurrency.symbol).toBe("tGLM")
    expect(chain.blockExplorers.default.url).toBe("https://rabdi.explorer.arkiv.network")
    expect(chain.testnet).toBe(true)
  })

  test('uses the public endpoint for "", and warns once', () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const chain = rabdi({ accessKey: "" })
      rabdi({ accessKey: "" })

      expect(chain.rpcUrls.default.http).toEqual([
        "https://rpc.rabdi.db-chain.testnet.arkiv.network",
      ])
      expect(chain.rpcUrls.default.webSocket).toEqual([
        "wss://rpc.rabdi.db-chain.testnet.arkiv.network",
      ])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain("https://hub.arkiv.network/access-keys")
    } finally {
      warn.mockRestore()
    }
  })

  test("does not warn with a key", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      rabdi({ accessKey: "k" })
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test("throws MissingAccessKeyError when the key is left out", () => {
    // @ts-expect-error the key is required
    expect(() => rabdi({})).toThrow(MissingAccessKeyError)
    // @ts-expect-error the options are required
    expect(() => rabdi()).toThrow(MissingAccessKeyError)
    // @ts-expect-error the key is a string
    expect(() => rabdi({ accessKey: undefined })).toThrow(MissingAccessKeyError)
    expect(() => rabdi({} as never)).toThrow("https://hub.arkiv.network/access-keys")
  })
})
