import { createPublicClient } from "@arkiv-network/sdk"
import { cheesecake } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"
import { http } from "viem"

// Create a public client
const publicClient = createPublicClient({
  chain: cheesecake, // cheesecake is the Arkiv testnet
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

// Build and execute a query using select().
// select() declares up front what to return: select() / select("*") returns everything,
// or pass an object to pick specific fields. The selection is flat and the result type is
// narrowed to exactly the selected fields.
const result = await publicClient
  .select({ key: true, owner: true, attributes: true, payload: true })
  .where(eq("category", "documentation"))
  .ownedBy("0xF46E23f6a6F6336D4C64D5D1c95599bF77a536f0")
  .limit(10)
  .fetch()

console.log("Found entities:", result.entities)

// Pagination
if (result.hasNextPage()) {
  const nextPage = await result.next()
  console.log("Next page:", nextPage.entities)
}

// Or walk every page, one entity at a time
for await (const item of publicClient
  .select({ key: true, attributes: true })
  .where(eq("category", "documentation"))) {
  console.log(item.key, item.attributes)
}
