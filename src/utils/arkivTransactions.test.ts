import { describe, expect, it, vi } from "bun:test"
import { toBytes, toHex } from "viem"
import type { ArkivClient } from "../clients/baseClient"
import { DuplicateAttributeError, InvalidAttributeError, InvalidExpirationError } from "../errors"
import { sendArkivTransaction } from "./arkivTransactions"

const ZERO_32 = `0x${"00".repeat(32)}`

function encodeStringTo128(str: string): string[] {
  const padded = new Uint8Array(128)
  padded.set(toBytes(str).slice(0, 128))
  return [
    toHex(padded.slice(0, 32)),
    toHex(padded.slice(32, 64)),
    toHex(padded.slice(64, 96)),
    toHex(padded.slice(96, 128)),
  ]
}

function makeClient() {
  const writeContract = vi.fn().mockResolvedValue("0xdeadbeef")
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({
    status: "success",
    transactionHash: "0xdeadbeef",
  })
  return {
    client: {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: 1 },
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      readContract: vi.fn().mockResolvedValue(0),
      writeContract,
      waitForTransactionReceipt,
    } as unknown as ArkivClient,
    writeContract,
  }
}

const BASE_CREATE = {
  payload: new Uint8Array([1, 2, 3]),
  contentType: "application/octet-stream",
  expiresIn: 3600,
}

async function captureAttributes(attributes: { key: string; value: string | number }[]) {
  const { client, writeContract } = makeClient()
  await sendArkivTransaction(client, {
    creates: [{ ...BASE_CREATE, attributes }],
  })
  const callArgs = writeContract.mock.calls[0][0]
  return callArgs.args[0][0].attributes as { name: string; valueType: number; value: string[] }[]
}

const validCreate = {
  payload: new Uint8Array([1, 2, 3]),
  contentType: "text/plain",
  attributes: [{ key: "k", value: "v" as string | number }],
  expiresIn: 1000,
}

describe("sendArkivTransaction expiration validation", () => {
  it("sends a transaction for a valid create", async () => {
    const { client, writeContract } = makeClient()
    const result = await sendArkivTransaction(client, { creates: [validCreate] })
    expect(writeContract).toHaveBeenCalledTimes(1)
    expect(result.receipt.status).toBe("success")
  })

  it("rejects when a create expiresIn is not a multiple of the block time", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, expiresIn: 51 }] }),
    ).rejects.toThrow(InvalidExpirationError)
  })

  it("rejects when a create expiresIn is not an integer", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, expiresIn: 51.5 }] }),
    ).rejects.toThrow(InvalidExpirationError)
  })

  it("rejects when an extension expiresIn is not a multiple of the block time", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { extensions: [{ entityKey: "0x123", expiresIn: 999 }] }),
    ).rejects.toThrow(InvalidExpirationError)
  })
})

describe("sendArkivTransaction attribute validation", () => {
  it("rejects when a numeric attribute value is not an integer", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [{ ...validCreate, attributes: [{ key: "n", value: 1.5 }] }],
      }),
    ).rejects.toThrow(InvalidAttributeError)
  })

  it("accepts integer numeric attribute values", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ ...validCreate, attributes: [{ key: "n", value: 123 }] }],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)
  })

  it("accepts string attribute values that look like non-integers", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, {
      creates: [{ ...validCreate, attributes: [{ key: "n", value: "1.5" }] }],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)
  })
})

describe("encodeAttribute", () => {
  it("encodes a plain string as STRING (valueType 2) left-aligned across 128 bytes", async () => {
    const [attr] = await captureAttributes([{ key: "name", value: "hello world" }])

    expect(attr.name).toBe(toHex("name", { size: 32 }))
    expect(attr.valueType).toBe(2)
    expect(attr.value).toEqual(encodeStringTo128("hello world"))
  })

  it("encodes an empty string as STRING with all-zero value", async () => {
    const [attr] = await captureAttributes([{ key: "tag", value: "" }])

    expect(attr.valueType).toBe(2)
    expect(attr.value).toEqual([ZERO_32, ZERO_32, ZERO_32, ZERO_32])
  })

  it("encodes a hex string as ENTITY_KEY (valueType 3) in first slot, rest zero", async () => {
    const entityKey = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    const [attr] = await captureAttributes([{ key: "ref", value: entityKey }])

    expect(attr.name).toBe(toHex("ref", { size: 32 }))
    expect(attr.valueType).toBe(3)
    expect(attr.value).toEqual([entityKey, ZERO_32, ZERO_32, ZERO_32])
  })

  it("treats short hex strings (0x prefix only) as ENTITY_KEY, not STRING", async () => {
    const [attr] = await captureAttributes([{ key: "x", value: "0x" }])

    expect(attr.valueType).toBe(3)
  })

  it("encodes a number as UINT (valueType 1) big-endian in first slot, rest zero", async () => {
    const [attr] = await captureAttributes([{ key: "count", value: 42 }])

    expect(attr.name).toBe(toHex("count", { size: 32 }))
    expect(attr.valueType).toBe(1)
    expect(attr.value).toEqual([toHex(42n, { size: 32 }), ZERO_32, ZERO_32, ZERO_32])
  })

  it("encodes zero as UINT", async () => {
    const [attr] = await captureAttributes([{ key: "n", value: 0 }])

    expect(attr.valueType).toBe(1)
    expect(attr.value).toEqual([ZERO_32, ZERO_32, ZERO_32, ZERO_32])
  })

  it("encodes a large number as UINT", async () => {
    const large = Number.MAX_SAFE_INTEGER
    const [attr] = await captureAttributes([{ key: "big", value: large }])

    expect(attr.valueType).toBe(1)
    expect(attr.value[0]).toBe(toHex(BigInt(large), { size: 32 }))
  })

  it("encodes multiple mixed-type attributes preserving order", async () => {
    const entityKey = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    const attrs = await captureAttributes([
      { key: "count", value: 7 },
      { key: "label", value: "test" },
      { key: "ref", value: entityKey },
    ])

    expect(attrs).toHaveLength(3)
    expect(attrs[0]).toMatchObject({ valueType: 1, name: toHex("count", { size: 32 }) })
    expect(attrs[1]).toMatchObject({ valueType: 2, name: toHex("label", { size: 32 }) })
    expect(attrs[2]).toMatchObject({ valueType: 3, name: toHex("ref", { size: 32 }) })
  })

  it("encodes a UTF-8 string longer than 32 bytes spanning multiple chunks", async () => {
    const long = "a".repeat(40)
    const [attr] = await captureAttributes([{ key: "body", value: long }])

    expect(attr.valueType).toBe(2)
    const [chunk0, chunk1] = attr.value
    expect(chunk0).toBe(toHex(new Uint8Array(32).fill(0x61))) // 32 × 'a'
    expect(chunk1.startsWith("0x6161616161616161")).toBe(true) // next 8 × 'a', then zeros
  })
})

describe("attribute sorting", () => {
  it("sorts attributes ascending by their bytes32 name before encoding", async () => {
    const attrs = await captureAttributes([
      { key: "tag", value: "zz" },
      { key: "status", value: "active" },
      { key: "score", value: 30 },
    ])

    expect(attrs.map((a) => a.name)).toEqual([
      toHex("score", { size: 32 }),
      toHex("status", { size: 32 }),
      toHex("tag", { size: 32 }),
    ])
  })

  it("sorts a shorter key before a longer key sharing its prefix", async () => {
    const attrs = await captureAttributes([
      { key: "abc", value: 1 },
      { key: "ab", value: 2 },
    ])

    expect(attrs.map((a) => a.name)).toEqual([
      toHex("ab", { size: 32 }),
      toHex("abc", { size: 32 }),
    ])
  })

  it("does not mutate the caller's attributes array", async () => {
    const input = [
      { key: "b", value: 1 },
      { key: "a", value: 2 },
    ]
    await captureAttributes(input)
    expect(input.map((a) => a.key)).toEqual(["b", "a"])
  })

  it("rejects duplicate attribute keys", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [
          {
            ...BASE_CREATE,
            attributes: [
              { key: "tag", value: "one" },
              { key: "tag", value: "two" },
            ],
          },
        ],
      }),
    ).rejects.toThrow(DuplicateAttributeError)
  })
})
