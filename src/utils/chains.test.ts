import { describe, expect, test } from "bun:test"
import { cheesecake, localhost } from "../chains"
import { chainFromName } from "./chains"

describe("chainFromName", () => {
  describe("valid chain names", () => {
    test("returns cheesecake chain for 'cheesecake'", () => {
      const chain = chainFromName("cheesecake")
      expect(chain).toBe(cheesecake)
      expect(chain.id).toBe(7733102)
      expect(chain.name).toBe("Cheesecake")
    })

    test("returns localhost chain for 'localhost'", () => {
      const chain = chainFromName("localhost")
      expect(chain).toBe(localhost)
      expect(chain.id).toBe(1337)
      expect(chain.name).toBe("Localhost")
    })
  })

  describe("case insensitivity", () => {
    test("handles uppercase chain names", () => {
      expect(chainFromName("CHEESECAKE")).toBe(cheesecake)
      expect(chainFromName("LOCALHOST")).toBe(localhost)
    })

    test("handles mixed case chain names", () => {
      expect(chainFromName("Cheesecake")).toBe(cheesecake)
      expect(chainFromName("Localhost")).toBe(localhost)
      expect(chainFromName("cHeEsEcAkE")).toBe(cheesecake)
    })
  })

  describe("error handling", () => {
    test("throws error for unknown chain name", () => {
      expect(() => chainFromName("unknown")).toThrow("Unknown chain: unknown")
    })

    test("throws error for empty string", () => {
      expect(() => chainFromName("")).toThrow("Unknown chain: ")
    })

    test("throws error for chain name with whitespace", () => {
      expect(() => chainFromName("cheesecake ")).toThrow("Unknown chain: cheesecake ")
      expect(() => chainFromName(" cheesecake")).toThrow("Unknown chain:  cheesecake")
    })

    test("throws error for similar but incorrect chain names", () => {
      expect(() => chainFromName("cheesecakee")).toThrow("Unknown chain: cheesecakee")
      expect(() => chainFromName("cheesecak")).toThrow("Unknown chain: cheesecak")
      expect(() => chainFromName("mendoza")).toThrow("Unknown chain: mendoza")
      expect(() => chainFromName("marketplace")).toThrow("Unknown chain: marketplace")
      expect(() => chainFromName("rosario")).toThrow("Unknown chain: rosario")
      expect(() => chainFromName("local")).toThrow("Unknown chain: local")
    })

    test("throws error for the retired chains", () => {
      expect(() => chainFromName("braga")).toThrow("Unknown chain: braga")
      expect(() => chainFromName("kaolin")).toThrow("Unknown chain: kaolin")
    })
  })

  describe("chain properties", () => {
    test("returned chain has required viem Chain properties", () => {
      const chain = chainFromName("cheesecake")

      expect(chain).toHaveProperty("id")
      expect(chain).toHaveProperty("name")
      expect(chain).toHaveProperty("network")
      expect(chain).toHaveProperty("nativeCurrency")
      expect(chain).toHaveProperty("rpcUrls")
      expect(typeof chain.id).toBe("number")
      expect(typeof chain.name).toBe("string")
    })

    test("returned chain has rpcUrls configured", () => {
      const chain = chainFromName("cheesecake")

      expect(chain.rpcUrls).toBeDefined()
      expect(chain.rpcUrls.default).toBeDefined()
      expect(chain.rpcUrls.default.http).toBeInstanceOf(Array)
      expect(chain.rpcUrls.default.http.length).toBeGreaterThan(0)
      expect(chain.rpcUrls.default.webSocket?.length).toBeGreaterThan(0)
    })
  })
})
