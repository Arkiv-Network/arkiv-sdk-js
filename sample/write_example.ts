import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { http, stringToBytes } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// A schema declares the attributes an entity carries, their types, and which of them the node
// indexes. Called with no arguments, a type constructor describes a column; called with a value,
// the same constructor makes a typed value.
const Posts = defineSchema("posts", {
  author: addr().indexed(),
  category: str().indexed(),
  score: dec().indexed(),
  title: str(), // stored, not indexed
  body: bytes(), // a blob; bytes can never be indexed
  thumbnail: bytes().optional(), // any number of bytes columns, and they may be left out
  mimeType: str().default("text/markdown"), // the SDK writes the default when it is left out
})

// Create a public client
const publicClient = createPublicClient({
  chain: tiramisu, // tiramisu is the Arkiv testnet
  transport: http(),
})

// Create a wallet client with an account
const account = privateKeyToAccount("0x...") // Replace with your private key
const client = createWalletClient({
  chain: tiramisu,
  transport: http(),
  account,
})

// Create an entity through the schema. Every value carries its type: use the tagged constructors,
// or a bare string (str), number (i32), bigint (u256), boolean (bool) or Uint8Array (bytes).
const { entityKey, txHash } = await client.createEntity(
  Posts,
  {
    author: addr(account.address),
    category: "documentation",
    score: dec("4.5"),
    title: "Hello from Arkiv",
    body: stringToBytes("# Hello\n\nArkiv chain wishes you all the best!"),
  },
  { expires: ExpirationTime.fromDays(30) }, // Entity expires in 30 days
)

console.log("Created entity:", entityKey)
console.log("Transaction hash:", txHash)

// Change what you name and nothing else.
await client.patchEntity(Posts, entityKey, { set: { score: dec("4.8") } })

// Read it back through the schema: a flat row, every column typed as the schema declares.
const post = await publicClient.getEntity(entityKey, Posts)
console.log("Title:", post.title.value, "score:", post.score.value, "type:", post.mimeType.value)
