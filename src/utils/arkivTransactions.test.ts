import { describe, expect, it, vi } from "bun:test"
import { stringToBytes, toHex } from "viem"
import type { UpdateEntityParameters } from "../actions/wallet/updateEntity"
import {
  type AttributeInputs,
  addr,
  bool,
  bytes32,
  dec,
  InvalidAttributeNameError,
  InvalidValueError,
  key,
  MissingValueError,
  str,
  u256,
} from "../attr"
import type { ArkivClient } from "../clients/baseClient"
import { InvalidExpirationError } from "../errors"
import { sendArkivTransaction } from "./arkivTransactions"

const ZERO_32 = `0x${"00".repeat(32)}`
const ENTITY_KEY = `0x${"ab".repeat(32)}` as const

function encodeStringTo128(value: string): string[] {
  const padded = new Uint8Array(128)
  padded.set(stringToBytes(value).slice(0, 128))
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

async function captureAttributes(attributes: AttributeInputs) {
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
  attributes: { k: "v" } as AttributeInputs,
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

describe("attribute typing through the write path", () => {
  it("rejects a value that does not fit the type it defaults to", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, { creates: [{ ...validCreate, attributes: { n: 1.5 } }] }),
    ).rejects.toThrow(InvalidValueError)
  })

  it("rejects an attribute name outside the on-chain grammar", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [{ ...validCreate, attributes: { "1bad": 1 } }],
      }),
    ).rejects.toThrow(InvalidAttributeNameError)
  })

  it("accepts a create with no attributes at all", async () => {
    const { client, writeContract } = makeClient()
    await sendArkivTransaction(client, { creates: [{ ...BASE_CREATE }] })
    expect(writeContract.mock.calls[0][0].args[0][0].attributes).toEqual([])
  })

  it("rejects an attribute whose value is absent, rather than writing a typeless one", async () => {
    const { client } = makeClient()
    await expect(
      sendArkivTransaction(client, {
        creates: [
          {
            ...validCreate,
            // What a spread of an optional-shaped object produces at runtime.
            attributes: { category: "docs", score: undefined } as unknown as AttributeInputs,
          },
        ],
      }),
    ).rejects.toThrow(MissingValueError)
  })

  it("requires attributes on an update, because an update replaces the whole set", async () => {
    const { client, writeContract } = makeClient()
    const update = {
      entityKey: ENTITY_KEY,
      payload: new Uint8Array([1]),
      contentType: "text/plain",
      expiresIn: 1000,
    }
    // @ts-expect-error — omitting `attributes` would erase every attribute on the entity, so the
    // type system makes you say so explicitly rather than letting it happen by default.
    const omitted: UpdateEntityParameters = update

    // Passing {} is the explicit way to ask for that erasure.
    await sendArkivTransaction(client, { updates: [{ ...omitted, attributes: {} }] })
    expect(writeContract.mock.calls[0][0].args[0][0].attributes).toEqual([])
  })
})

describe("attribute encoding", () => {
  it("carries the protocol typeId of whichever type the value names", async () => {
    const attrs = await captureAttributes({
      flag: bool(true),
      count: 42,
      balance: u256(1n),
      score: dec("3.5"),
      digest: bytes32(ENTITY_KEY),
      label: str("x"),
      account: addr("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
      parent: key(ENTITY_KEY),
    })
    const byName = Object.fromEntries(attrs.map((a) => [a.name, a.valueType]))
    expect(byName[toHex("flag", { size: 32 })]).toBe(1)
    expect(byName[toHex("count", { size: 32 })]).toBe(2)
    expect(byName[toHex("balance", { size: 32 })]).toBe(3)
    expect(byName[toHex("score", { size: 32 })]).toBe(4)
    expect(byName[toHex("digest", { size: 32 })]).toBe(5)
    expect(byName[toHex("label", { size: 32 })]).toBe(7)
    expect(byName[toHex("account", { size: 32 })]).toBe(8)
    expect(byName[toHex("parent", { size: 32 })]).toBe(9)
  })

  it("gives a bare number i32 rather than the old unsigned type", async () => {
    const [attr] = await captureAttributes({ count: 42 })
    expect(attr.valueType).toBe(2)
    expect(attr.value).toEqual([toHex(42n, { size: 32 }), ZERO_32, ZERO_32, ZERO_32])
  })

  it("keeps a hex-looking string a string, instead of guessing at an entity key", async () => {
    for (const value of ["0x", "0xab", ENTITY_KEY]) {
      const [attr] = await captureAttributes({ x: value })
      expect(attr.valueType).toBe(7)
      expect(attr.value).toEqual(encodeStringTo128(value))
    }
    // The bytes are the UTF-8 text, not a hex decode: "0xab" is the four characters 0, x, a, b.
    const [attr] = await captureAttributes({ x: "0xab" })
    expect(attr.value[0].startsWith("0x30786162")).toBe(true)
  })

  it("packs a string longer than one word across the following words", async () => {
    const [attr] = await captureAttributes({ body: "a".repeat(40) })
    const [chunk0, chunk1] = attr.value
    expect(chunk0).toBe(toHex(new Uint8Array(32).fill(0x61)))
    expect(chunk1.startsWith("0x6161616161616161")).toBe(true)
  })
})

describe("attribute sorting", () => {
  it("sorts attributes ascending by their bytes32 name before encoding", async () => {
    const attrs = await captureAttributes({ tag: "zz", status: "active", score: 30 })

    expect(attrs.map((a) => a.name)).toEqual([
      toHex("score", { size: 32 }),
      toHex("status", { size: 32 }),
      toHex("tag", { size: 32 }),
    ])
  })

  it("sorts a shorter name before a longer one sharing its prefix", async () => {
    const attrs = await captureAttributes({ abc: 1, ab: 2 })

    expect(attrs.map((a) => a.name)).toEqual([
      toHex("ab", { size: 32 }),
      toHex("abc", { size: 32 }),
    ])
  })
})
