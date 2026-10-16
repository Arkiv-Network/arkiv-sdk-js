import { describe, expect, it, vi } from "bun:test"
import { decodeAbiParameters, parseAbiParameters, toHex } from "viem"
import type { ArkivClient } from "../../clients/baseClient"
import { OperationType } from "../../entity/params"
import { bytes, defineSchema, i32, str } from "../../schema"
import { executeBatch } from "./executeBatch"

const ENTITY_KEY = `0x${"ab".repeat(32)}` as const
const OTHER_KEY = `0x${"cd".repeat(32)}` as const
const NEW_OWNER = "0x2222222222222222222222222222222222222222"

const PATCH_PARAMS = parseAbiParameters(
  "(bytes32 entityKey, (bytes32 name, uint8 typeId, bytes value)[] mutations)",
)

function makeClient() {
  const writeContract = vi.fn().mockResolvedValue("0xdeadbeef")
  return {
    client: {
      account: { address: "0x1111111111111111111111111111111111111111" },
      chain: { id: 1 },
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      readContract: vi.fn().mockResolvedValue(7n),
      writeContract,
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        transactionHash: "0xdeadbeef",
        logs: [],
      }),
    } as unknown as ArkivClient,
    writeContract,
  }
}

describe("the empty-batch guard", () => {
  it("counts every kind of operation, not just the first four", async () => {
    // An ownership-only batch is a batch: it used to be rejected because the guard listed
    // creates/updates/deletes/extensions and forgot ownershipChanges.
    const { client, writeContract } = makeClient()
    const result = await executeBatch(client, {
      ownershipChanges: [{ entityKey: ENTITY_KEY, newOwner: NEW_OWNER }],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)
    expect(result.ownershipChanges).toEqual([ENTITY_KEY])
  })

  it("rejects a batch with nothing in it", async () => {
    const { client, writeContract } = makeClient()
    await expect(executeBatch(client, {})).rejects.toThrow(/No operations/)
    // Present but empty is just as empty — the engine would revert with EmptyBatch().
    await expect(executeBatch(client, { deletes: [], ownershipChanges: [] })).rejects.toThrow(
      /No operations/,
    )
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("counts only real operation kinds, not whatever keys the caller passed", async () => {
    const { client, writeContract } = makeClient()
    // `updates` was this API's name for patches until they were renamed. Counting the caller's own
    // keys would score this batch as non-empty and then drop it on the way to the wire, sending
    // execute([]) — so the guard counts the five kinds that actually reach the transaction.
    const stale = { updates: [{ entityKey: ENTITY_KEY, set: { level: 1 } }] } as never
    await expect(executeBatch(client, stale)).rejects.toThrow(/No operations/)
    // A typo is the same mistake with a different name.
    await expect(
      executeBatch(client, { delete: [{ entityKey: ENTITY_KEY }] } as never),
    ).rejects.toThrow(/No operations/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("does not let a stale key smuggle itself into a batch that is otherwise valid", async () => {
    const { client, writeContract } = makeClient()
    // The dangerous shape: the creates apply and the transaction succeeds, so nothing surfaces the
    // fact that the `updates` never happened. The guard cannot catch this one — only the caller's
    // types can — but the result must at least not claim they did.
    const result = await executeBatch(client, {
      deletes: [{ entityKey: ENTITY_KEY }],
      updates: [{ entityKey: ENTITY_KEY, set: { level: 1 } }],
    } as never)
    expect(result.patchedEntities).toEqual([])
    // Only the delete reached the wire, and the report says so.
    expect(writeContract.mock.calls[0][0].args[0]).toHaveLength(1)
  })
})

describe("schemas in a batch", () => {
  it("types each patch by its own schema", async () => {
    const Posts = defineSchema({ title: str(), score: i32().indexed() })
    const Files = defineSchema({ path: str().indexed(), body: bytes().optional() })
    const { client, writeContract } = makeClient()

    const result = await executeBatch(client, {
      patches: [
        { schema: Posts, entityKey: ENTITY_KEY, set: { score: 5 } },
        { schema: Files, entityKey: OTHER_KEY, set: { path: "/a" }, unset: ["body"] },
      ],
    })

    expect(result.patchedEntities).toEqual([ENTITY_KEY, OTHER_KEY])
    const ops = writeContract.mock.calls[0][0].args[0] as {
      operation: number
      operationData: `0x${string}`
    }[]
    expect(ops.map((op) => op.operation)).toEqual([OperationType.Patch, OperationType.Patch])
    const [posts, files] = ops.map((op) => decodeAbiParameters(PATCH_PARAMS, op.operationData)[0])
    expect(posts.mutations.map((m) => [m.name, m.typeId])).toEqual([
      [toHex("score", { size: 32 }), 0x80 | 2],
    ])
    expect(files.mutations.map((m) => [m.name, m.typeId])).toEqual([
      [toHex("body", { size: 32 }), 0],
      [toHex("path", { size: 32 }), 0x80 | 8],
    ])
  })
})
