import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { hexToString, http, isHex, stringToBytes } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Run with ARKIV_ACCESS_KEY and PRIVATE_KEY set, e.g. in a .env file:
//   ARKIV_ACCESS_KEY  a free access key from https://hub.arkiv.network/access-keys
//   PRIVATE_KEY       an account funded with testnet tGLM from https://hub.arkiv.network/faucet

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

// Rabdi is the Arkiv testnet. Without an access key, it uses the rate-limited public endpoint.
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error(
    "Set PRIVATE_KEY to the private key of an account funded at hub.arkiv.network/faucet",
  )
}
const account = privateKeyToAccount(privateKey)

const publicClient = createPublicClient({ chain, transport: http() })
const walletClient = createWalletClient({ chain, transport: http(), account })

// Create an entity through the schema. Every value carries its type: use the tagged constructors,
// or a bare string (str), number (i32), bigint (u256), boolean (bool) or Uint8Array (bytes).
// createEntity resolves once the transaction is in a block.
const { entityKey, txHash } = await walletClient.createEntity(
  Posts,
  {
    author: addr(account.address),
    category: "docs",
    score: dec("4.5"),
    title: "Hello from Arkiv",
    body: stringToBytes("# Hello\n\nArkiv chain wishes you all the best!"),
  },
  { expiration: ExpirationTime.fromDays(1) }, // the entity expires in a day
)
console.log("Created entity:", entityKey)
console.log("Transaction hash:", txHash)

// Change what you name and nothing else.
await walletClient.patchEntity(Posts, entityKey, { set: { score: dec("4.8") } })

// Read it back by key: a flat row, every column typed as the schema declares.
const post = await publicClient.getEntity(entityKey, Posts)
console.log("Title:", post.title.value, "score:", post.score.value, "type:", post.mimeType.value)

// Or find it with a query. select() names entity fields and columns side by side, and where() may
// only filter on indexed columns, compared against values of their type.
const result = await publicClient
  .select({ $key: true, title: true, score: true, body: true })
  .from(Posts)
  .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
  .ownedBy(account.address)
  .limit(10)
  .fetch()

for (const row of result.entities) {
  console.log(row.$key, row.title.value, row.score.value, hexToString(row.body.value))
}
