import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"

const publicClient = createPublicClient({
  chain: tiramisu, // tiramisu is the Arkiv testnet
  transport: http(),
})

// Replay the recent past before following the head. Keep the window small: `fromBlock` becomes an
// eth_getLogs range, and asking a public RPC for the whole chain from block 0 is rejected outright.
const fromBlock = (await publicClient.getBlockNumber()) - 100n

// Watch entity events. Every handler is optional — the watcher only does the work for the ones
// you pass. Each event carries the block, transaction and log index it came from, which is the
// order the operations were applied in.
const unwatch = publicClient.watchEntityEvents({
  onEntityCreated: ({ entityKey, owner, expiresAt, creationFlags, blockNumber }) => {
    console.log(`created ${entityKey} by ${owner}, expires at block ${expiresAt} (@${blockNumber})`)
    if (creationFlags.readonly) console.log("  readonly — its contents can never change")
    if (creationFlags.permissionlessExtension) console.log("  anyone may extend its expiry")
  },
  onEntityPatched: ({ entityKey }) => {
    // The event says *that* the entity changed, not what to — read it back to see the new state.
    console.log("patched", entityKey)
  },
  onExpiryExtended: ({ entityKey, owner, expiresAt }) => {
    console.log(`${entityKey} (owned by ${owner}) now lives until block ${expiresAt}`)
  },
  onOwnershipTransferred: ({ entityKey, previousOwner, newOwner }) => {
    console.log(`${entityKey}: ${previousOwner} -> ${newOwner}`)
  },
  onEntityDeleted: ({ entityKey }) => {
    console.log("deleted", entityKey)
  },
  // Defaults to console.error if you leave it out — a watcher that goes quiet because the node
  // dropped its filter looks exactly like a quiet chain, so the failure is never silent.
  onError: (error) => console.error("watchEntityEvents error", error),
  fromBlock,
})

// There is deliberately no expiry handler: an entity reaching its expiry block is not an operation,
// so it emits no log and nothing can watch for it. To find what has expired — or is about to —
// query $expiresAt, which answers for every entity rather than only the ones a watcher happened to
// see created:
//
//   const expiringSoon = await publicClient
//     .select({ key: true, expiresAt: true })
//     .where(lt("$expiresAt", u64(await publicClient.getBlockNumber() + 1000n)))
//     .fetch()

// Or take every event in one handler — the shape a replica replaying operation by operation wants.
const unwatchAll = publicClient.watchEntityEvents({
  onEvent: (event) => {
    console.log(event.blockNumber, event.logIndex, event.type, event.entityKey)
  },
})

// Both return a function that stops the watcher. Watchers poll in the background, so the process
// has to stay alive for anything to arrive — here, for a minute.
console.log("watching for 60s...")
setTimeout(() => {
  unwatch()
  unwatchAll()
  console.log("stopped")
}, 60_000)
