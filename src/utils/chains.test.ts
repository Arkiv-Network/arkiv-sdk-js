import { describe, expect, test } from "bun:test"
import { kaolin, localhost, marketplace, mendoza } from "../chains"
import { chainFromName } from "./chains"

describe("chainFromName", () => {
  describe("valid chain names", () => {
    test("returns kaolin chain for 'kaolin'", () => {
      const chain = chainFromName("kaolin")
      expect(chain).toBe(kaolin)
      expect(chain.id).toBe(60138453025)
      expect(chain.name).toBe("Kaolin")
    })

    test("returns mendoza chain for 'mendoza'", () => {
      const chain = chainFromName("mendoza")
      expect(chain).toBe(mendoza)
      expect(chain.id).toBe(60138453056)
      expect(chain.name).toBe("Mendoza")
    })

    test("returns localhost chain for 'localhost'", () => {
      const chain = chainFromName("localhost")
      expect(chain).toBe(localhost)
      expect(chain.id).toBe(1337)
      expect(chain.name).toBe("Localhost")
    })

    test("returns marketplace chain for 'marketplace'", () => {
      const chain = chainFromName("marketplace")
      expect(chain).toBe(marketplace)
      expect(chain.id).toBe(60138453027)
      expect(chain.name).toBe("Marketplace")
    })
  })

  describe("case insensitivity", () => {
    test("handles uppercase chain names", () => {
      expect(chainFromName("KAOLIN")).toBe(kaolin)
      expect(chainFromName("MENDOZA")).toBe(mendoza)
      expect(chainFromName("LOCALHOST")).toBe(localhost)
      expect(chainFromName("MARKETPLACE")).toBe(marketplace)
    })

    test("handles mixed case chain names", () => {
      expect(chainFromName("Kaolin")).toBe(kaolin)
      expect(chainFromName("Mendoza")).toBe(mendoza)
      expect(chainFromName("Localhost")).toBe(localhost)
      expect(chainFromName("Marketplace")).toBe(marketplace)
      expect(chainFromName("kAoLiN")).toBe(kaolin)
      expect(chainFromName("MeNdOzA")).toBe(mendoza)
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
      expect(() => chainFromName("kaolin ")).toThrow("Unknown chain: kaolin ")
      expect(() => chainFromName(" kaolin")).toThrow("Unknown chain:  kaolin")
    })

    test("throws error for similar but incorrect chain names", () => {
      expect(() => chainFromName("kaolinn")).toThrow("Unknown chain: kaolinn")
      expect(() => chainFromName("mendoz")).toThrow("Unknown chain: mendoz")
      expect(() => chainFromName("local")).toThrow("Unknown chain: local")
    })
  })

  describe("chain properties", () => {
    test("returned chain has required viem Chain properties", () => {
      const chain = chainFromName("kaolin")

      expect(chain).toHaveProperty("id")
      expect(chain).toHaveProperty("name")
      expect(chain).toHaveProperty("network")
      expect(chain).toHaveProperty("nativeCurrency")
      expect(chain).toHaveProperty("rpcUrls")
      expect(typeof chain.id).toBe("number")
      expect(typeof chain.name).toBe("string")
    })

    test("returned chain has rpcUrls configured", () => {
      const chain = chainFromName("mendoza")

      expect(chain.rpcUrls).toBeDefined()
      expect(chain.rpcUrls.default).toBeDefined()
      expect(chain.rpcUrls.default.http).toBeInstanceOf(Array)
      expect(chain.rpcUrls.default.http.length).toBeGreaterThan(0)
    })
  })
})
