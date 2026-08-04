import { describe, expect, it, vi } from "bun:test"
import type { ArkivClient } from "../../clients/baseClient"
import { mutateEntities } from "./mutateEntities"

const ENTITY_KEY = `0x${"ab".repeat(32)}` as const
const NEW_OWNER = "0x2222222222222222222222222222222222222222"

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
    const result = await mutateEntities(client, {
      ownershipChanges: [{ entityKey: ENTITY_KEY, newOwner: NEW_OWNER }],
    })
    expect(writeContract).toHaveBeenCalledTimes(1)
    expect(result.ownershipChanges).toEqual([ENTITY_KEY])
  })

  it("rejects a batch with nothing in it", async () => {
    const { client, writeContract } = makeClient()
    await expect(mutateEntities(client, {})).rejects.toThrow(/No operations/)
    // Present but empty is just as empty — the engine would revert with EmptyBatch().
    await expect(mutateEntities(client, { deletes: [], ownershipChanges: [] })).rejects.toThrow(
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
    await expect(mutateEntities(client, stale)).rejects.toThrow(/No operations/)
    // A typo is the same mistake with a different name.
    await expect(
      mutateEntities(client, { delete: [{ entityKey: ENTITY_KEY }] } as never),
    ).rejects.toThrow(/No operations/)
    expect(writeContract).not.toHaveBeenCalled()
  })

  it("does not let a stale key smuggle itself into a batch that is otherwise valid", async () => {
    const { client, writeContract } = makeClient()
    // The dangerous shape: the creates apply and the transaction succeeds, so nothing surfaces the
    // fact that the `updates` never happened. The guard cannot catch this one — only the caller's
    // types can — but the result must at least not claim they did.
    const result = await mutateEntities(client, {
      deletes: [{ entityKey: ENTITY_KEY }],
      updates: [{ entityKey: ENTITY_KEY, set: { level: 1 } }],
    } as never)
    expect(result.patchedEntities).toEqual([])
    // Only the delete reached the wire, and the report says so.
    expect(writeContract.mock.calls[0][0].args[0]).toHaveLength(1)
  })
})
