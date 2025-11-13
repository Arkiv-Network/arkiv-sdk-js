import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk"
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts"
import { mendoza } from "@arkiv-network/sdk/chains"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"

// Create a public client
const publicClient = createPublicClient({
  chain: mendoza, // mendoza is the Arkiv testnet for the purposes of hackathons organized in Buenos Aires during devconnect 2025
  transport: http(),
})

// Create a wallet client with an account
const client = createWalletClient({
  chain: mendoza,
  transport: http(),
  account: privateKeyToAccount("0x..."), // Replace with your private key
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
