import { describe, expect, it, vi } from "bun:test"
import { encodeFunctionResult, type Hex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { ARKIV_ADDRESS } from "../../consts"
import { predictEntityKey } from "../../entity/key"
import { ENTITY_NONCE_ABI } from "../../entity/operations"
import { getEntityNonce } from "./getEntityNonce"
import { predictEntityKeys } from "./predictEntityKeys"

const OWNER = "0x1111111111111111111111111111111111111111" as const
const CHAIN_ID = 1337

/** A client whose `eth_call` answers one nonce, and records what it was asked. */
function makeClient(nonce: bigint, options: { chain?: boolean } = {}) {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_call") {
      return encodeFunctionResult({
        abi: ENTITY_NONCE_ABI,
        functionName: "entityNonce",
        result: nonce,
      })
    }
    if (method === "eth_chainId") return `0x${CHAIN_ID.toString(16)}`
    throw new Error(`unexpected request: ${method}`)
  })
  const client = {
    ...(options.chain === false ? {} : { chain: { id: CHAIN_ID } }),
    request,
  } as unknown as ArkivClient
  return { client, request }
}

/** The `eth_call` the client was asked to make. */
function ethCall(request: ReturnType<typeof vi.fn>) {
  const call = request.mock.calls.find(([body]) => body.method === "eth_call")
  return call?.[0].params[0] as { to: Hex; data: Hex }
}

describe("getEntityNonce", () => {
  it("reads the owner's minting nonce off the registry", async () => {
    const { client, request } = makeClient(7n)

    expect(await getEntityNonce(client, OWNER)).toBe(7n)

    // The selector is part of the node's ABI: `cast sig 'entityNonce(address)'` is 0x36917bfd.
    const { to, data } = ethCall(request)
    expect(to).toBe(ARKIV_ADDRESS)
    expect(data).toBe(`0x36917bfd000000000000000000000000${OWNER.slice(2)}`)
  })

  it("reports a fresh account as zero rather than as an absence", async () => {
    const { client } = makeClient(0n)
    expect(await getEntityNonce(client, OWNER)).toBe(0n)
  })
})

describe("predictEntityKeys", () => {
  it("derives one pair per create, walking the nonce forward", async () => {
    const { client } = makeClient(7n)

    const pairs = await predictEntityKeys(client, { owner: OWNER, salts: [1n, 2n, 3n] })

    expect(pairs).toEqual([
      { salt: 1n, key: predictEntityKey({ owner: OWNER, nonce: 7n, salt: 1n, chainId: CHAIN_ID }) },
      { salt: 2n, key: predictEntityKey({ owner: OWNER, nonce: 8n, salt: 2n, chainId: CHAIN_ID }) },
      { salt: 3n, key: predictEntityKey({ owner: OWNER, nonce: 9n, salt: 3n, chainId: CHAIN_ID }) },
    ])
    // Distinct keys, which is the whole point of the nonce.
    expect(new Set(pairs.map((pair) => pair.key)).size).toBe(3)
  })

  it("makes up the salts when only asked for a count, and pairs each with its key", async () => {
    const { client } = makeClient(0n)

    // A literal count is a tuple, so this destructures without a cast — that it compiles is the
    // assertion.
    const [first, second] = await predictEntityKeys(client, { owner: OWNER, count: 2 })

    // Random salts, so the only thing worth asserting is that the keys follow from them.
    expect(first.key).toBe(
      predictEntityKey({ owner: OWNER, nonce: 0n, salt: first.salt, chainId: CHAIN_ID }),
    )
    expect(second.key).toBe(
      predictEntityKey({ owner: OWNER, nonce: 1n, salt: second.salt, chainId: CHAIN_ID }),
    )
    expect(first.salt).not.toBe(second.salt)
  })

  it("keeps a runtime count a plain array rather than guessing its length", async () => {
    const { client } = makeClient(0n)
    const count: number = 3

    const pairs = await predictEntityKeys(client, { owner: OWNER, count })

    expect(pairs).toHaveLength(3)
    expect(pairs.map((pair) => pair.key)).toEqual(
      pairs.map((pair, index) =>
        predictEntityKey({
          owner: OWNER,
          nonce: BigInt(index),
          salt: pair.salt,
          chainId: CHAIN_ID,
        }),
      ),
    )
  })

  it("prefers the salts it was given over the count", async () => {
    const { client } = makeClient(0n)
    const pairs = await predictEntityKeys(client, { owner: OWNER, count: 5, salts: [9n] })
    expect(pairs).toEqual([
      { salt: 9n, key: predictEntityKey({ owner: OWNER, nonce: 0n, salt: 9n, chainId: CHAIN_ID }) },
    ])
  })

  it("asks the chain for its id when the client was built without one", async () => {
    const { client, request } = makeClient(0n, { chain: false })

    const [only] = await predictEntityKeys(client, { owner: OWNER, salts: [1n] })

    expect(request.mock.calls.some(([body]) => body.method === "eth_chainId")).toBe(true)
    expect(only.key).toBe(
      predictEntityKey({ owner: OWNER, nonce: 0n, salt: 1n, chainId: CHAIN_ID }),
    )
  })

  it("refuses a request that does not say how many keys it wants", async () => {
    const { client } = makeClient(0n)
    await expect(predictEntityKeys(client, { owner: OWNER })).rejects.toThrow(/`count` or `salts`/)
    await expect(predictEntityKeys(client, { owner: OWNER, salts: [] })).rejects.toThrow(/empty/)
    await expect(predictEntityKeys(client, { owner: OWNER, count: 0 })).rejects.toThrow(
      /positive whole number/,
    )
    await expect(predictEntityKeys(client, { owner: OWNER, count: 1.5 })).rejects.toThrow(
      /positive whole number/,
    )
  })

  it("rejects a salt too wide for the uint128 the engine mixes in", async () => {
    const { client } = makeClient(0n)
    await expect(predictEntityKeys(client, { owner: OWNER, salts: [2n ** 128n] })).rejects.toThrow()
  })
})
