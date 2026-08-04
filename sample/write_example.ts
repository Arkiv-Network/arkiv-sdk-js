import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { dec, i32 } from "@arkiv-network/sdk/attr"
import { braga } from "@arkiv-network/sdk/chains"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Create a public client
const publicClient = createPublicClient({
  chain: braga, // braga is the Arkiv testnet
  transport: http(),
})

// Create a wallet client with an account
const client = createWalletClient({
  chain: braga,
  transport: http(),
  account: privateKeyToAccount("0x..."), // Replace with your private key
})

// Create an entity
const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({
    entity: {
      entityType: "document",
      entityId: "doc-123",
      entityContent: "Hello from DevConnect Hackathon 2025! Arkiv chain wish you all the best!",
    },
  }),
  contentType: "application/json",
  // Attributes are keyed by name, and every value carries its type. Use the tagged constructors
  // from "@arkiv-network/sdk/attr", or pass a bare boolean, number, bigint or string where the
  // type is unambiguous.
  attributes: {
    category: "documentation", // bare string -> str
    version: i32(1),
    score: dec("4.5"),
  },
  expires: ExpirationTime.fromDays(30), // Entity expires in 30 days
})

console.log("Created entity:", entityKey)
console.log("Transaction hash:", txHash)

const newEntity = await publicClient.getEntity(entityKey)
console.log("Entity:", newEntity)
