import { createPublicClient, http } from "@arkiv-network/sdk"
import { kaolin } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"

// Create a public client
const publicClient = createPublicClient({
  chain: kaolin, // kaolin is the Arkiv testnet
  transport: http(),
})

// Get chain ID
const chainId = await publicClient.getChainId()
console.log("Chain ID:", chainId)

// Get entity by key
const entity = await publicClient.getEntity(
  "0x5107170ed413324eba80a55d378a412e7ac4b067de3e2727a6783ed044cecd23",
)
console.log("Entity:", entity)

// Build and execute a query using QueryBuilder
const query = publicClient.buildQuery()
const result = await query
  .where(eq("category", "documentation"))
  .ownedBy("0xF46E23f6a6F6336D4C64D5D1c95599bF77a536f0")
  .withAttributes(true)
  .withPayload(true)
  .limit(10)
  .fetch()

console.log("Found entities:", result.entities)

// Pagination - fetch next page
if (result.hasNextPage()) {
  await result.next()
  console.log("Next page:", result.entities)
}
