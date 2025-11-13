import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk"
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts"
import { mendoza } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"

// Create a public client
const publicClient = createPublicClient({
  chain: mendoza, // mendoza is the Arkiv testnet for the purposes of hackathons organized in Buenos Aires during devconnect 2025
  transport: http(),
})

// Get chain ID
const chainId = await publicClient.getChainId()
console.log("Chain ID:", chainId)

// Get entity by key
const entity = await publicClient.getEntity("0x...") // Replace with your private key
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

// Create a wallet client with an account
const client = createWalletClient({
  chain: mendoza,
  transport: http(),
  account: privateKeyToAccount(
    "0x3d05798f7d11bb1c10b83fed8d3b4d76570c31cd66c8e0a8d8d991434c6d7a5e",
  ), // Your private key
})

// Create an entity
const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({
    entity: {
      entityType: "document",
      entityId: "doc-123",
      entityContent:
        "Hello from DevConnect Hackathon 2025! Arkiv Mendoza chain wish you all the best!",
    },
  }),
  contentType: "application/json",
  attributes: [
    { key: "category", value: "documentation" },
    { key: "version", value: "1.0" },
  ],
  expiresIn: ExpirationTime.fromDays(30), // Entity expires in 30 days
})

console.log("Created entity:", entityKey)
console.log("Transaction hash:", txHash)

const newEntity = await publicClient.getEntity(entityKey)
console.log("Entity:", newEntity)
