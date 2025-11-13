import { createPublicClient, http } from "@arkiv-network/sdk"
import { mendoza } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"

// Create a public client
const publicClient = createPublicClient({
  chain: mendoza, // mendoza is the Arkiv testnet for the purposes of hackathons organized in Buenos Aires during devconnect 2025
  transport: http(),
})

// Get chain ID
const chainId = await publicClient.getChainId()
console.log("Chain ID:", chainId)

// Get entity by key
const entity = await publicClient.getEntity(
  "0xcadb830a3414251d65e5c92cd28ecb648d9e73d85f2203eff631839d5421f9d7",
)
console.log("Entity:", entity)

// Build and execute a query using QueryBuilder
const query = publicClient.buildQuery()
const result = await query
  .where(eq("category", "documentation"))
  .ownedBy("0x6186B0DbA9652262942d5A465d49686eb560834C")
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
