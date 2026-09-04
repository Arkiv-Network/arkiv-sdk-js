// The advanced write path: every step the everyday `createEntity` bundles for you — nonce, gas,
// fees, sending, waiting, decoding — done by hand, so the whole write costs the minimum number of
// RPC calls and every one of them is visible in this file.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import { http, parseGwei } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const account = privateKeyToAccount("0x...") // Replace with your private key

// The reads come from a public client, the send from a wallet client.
const publicClient = createPublicClient({
  chain: tiramisu, // tiramisu is the Arkiv testnet
  transport: http(),
})

const client = createWalletClient({
  chain: tiramisu,
  transport: http(),
  account,
})

// ── Step 1: gather everything the transaction needs, manually ────────────────────────────────────
// These are the lookups viem would silently make for you on the everyday path. Fetching them
// yourself (and in parallel) is what lets the send below collapse to a single RPC call — and lets
// you reuse them across many transactions instead of paying for them on every send.

const [block, nonce, [predicted]] = await Promise.all([
  // The chain head, for two jobs at once: its number resolves our relative expiry below (an
  // absolute `ExpirationTime.atBlock(n)` would not need it), and its base fee prices the
  // transaction. When sending many transactions, refresh this occasionally, not per send.
  publicClient.getBlock(),
  // The account nonce. "pending" so queued-but-unmined transactions are counted; when sending
  // many transactions, fetch this once and increment it locally.
  publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
  // The key our create will mint, known before anything is sent. The pair travels together:
  // the create must carry `predicted.salt` for its key to come out as `predicted.key`.
  publicClient.predictEntityKeys({ owner: account.address, count: 1 }),
])

console.log("Predicted entity key:", predicted.key)

// Price the transaction yourself instead of letting viem estimate: a tip you choose, and a cap
// with headroom over the current base fee so it survives a few blocks of fee growth.
const maxPriorityFeePerGas = parseGwei("0.001")
const maxFeePerGas = (block.baseFeePerGas ?? 0n) * 2n + maxPriorityFeePerGas

// ── Step 2: send — exactly one RPC call (eth_sendRawTransaction) ─────────────────────────────────
// With `currentBlock` and full `txParams` supplied, viem has nothing left to look up: no nonce
// query, no fee query, no gas estimation, and sendMutation itself never waits or polls.

const { txHash } = await client.advanced.sendMutation(
  {
    creates: [
      {
        payload: jsonToPayload({ message: "Hello from the advanced path!" }),
        contentType: "application/json",
        attributes: { category: "documentation" },
        expires: ExpirationTime.fromDays(30),
        salt: predicted.salt, // the salt behind predicted.key — omit it and the key comes out random
      },
    ],
  },
  {
    currentBlock: block.number,
    txParams: {
      nonce,
      gas: 1_000_000n, // set your own limit; skipping this costs an eth_estimateGas per send
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
  },
)

console.log("Transaction sent:", txHash)

// ── Step 3: check for the receipt on your own schedule ───────────────────────────────────────────
// Nothing in the SDK is polling now — the transaction is in the mempool and following it is your
// job. Each ping is exactly one eth_getTransactionReceipt; an unmined transaction comes back as
// { status: "pending" } instead of being waited on.

let ping = await client.advanced.pingTransaction(txHash)
while (ping.status === "pending") {
  console.log("Still pending, checking again in 2s...")
  await new Promise((resolve) => setTimeout(resolve, 2000)) // your schedule, not the SDK's
  ping = await client.advanced.pingTransaction(txHash)
}
console.log(`Mined in block ${ping.blockNumber} with status: ${ping.status}`)

// ── Step 4: read what the mutation did ───────────────────────────────────────────────────────────
// One more eth_getTransactionReceipt, decoded into entity keys and expiries. (If you only created
// entities and predicted the keys up front, you can skip this call entirely — the ping above
// already told you the batch applied.)

const result = await client.advanced.getMutationResult(txHash)
if (result.status === "pending") throw new Error("unreachable — the ping loop saw it mined")
if (result.status === "reverted") {
  // No revert diagnosis is run for you on this path — spend a simulateContract here if you want
  // the reason, or just report the failure.
  throw new Error(`Mutation reverted in block ${result.blockNumber}`)
}

console.log("Created entity:", result.createdEntities[0])
console.log("Expires at block:", result.createdExpiries[0])
console.log("Key matches prediction:", result.createdEntities[0] === predicted.key)
