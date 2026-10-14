import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { hexToString, http } from "viem"

// The same schema the writer used. A schema is an SDK-side convention: the node only sees typed
// attributes, each flagged indexed or not.
const Posts = defineSchema("posts", {
  author: addr().indexed(),
  category: str().indexed(),
  score: dec().indexed(),
  title: str(),
  body: bytes(),
  thumbnail: bytes().optional(),
  mimeType: str().default("text/markdown"),
})

// Create a public client
const publicClient = createPublicClient({
  chain: tiramisu, // tiramisu is the Arkiv testnet
  transport: http(),
})

// Get chain ID
const chainId = await publicClient.getChainId()
console.log("Chain ID:", chainId)

// Get entity by key — untyped, with every attribute in `attributes`
const entity = await publicClient.getEntity(
  "0x5107170ed413324eba80a55d378a412e7ac4b067de3e2727a6783ed044cecd23",
)
console.log("Entity:", entity)

// Query through the schema. select() names entity fields and columns side by side, and the
// result rows are typed to exactly those. where() may only filter on indexed columns, compared
// against values of their type — eq("title", ...) would not compile, since title is not indexed.
const result = await publicClient
  .select({ key: true, author: true, title: true, body: true })
  .from(Posts)
  .where(and(eq("category", "documentation"), gt("score", dec("4.0"))))
  .ownedBy("0xF46E23f6a6F6336D4C64D5D1c95599bF77a536f0")
  .limit(10)
  .fetch()

for (const row of result.entities) {
  console.log(row.key, row.author.value, row.title.value, hexToString(row.body.value))
}

// Pagination
if (result.hasNextPage()) {
  const nextPage = await result.next()
  console.log("Next page:", nextPage.entities)
}

// Or walk every page, one row at a time
for await (const row of publicClient
  .select({ key: true, title: true })
  .from(Posts)
  .where(eq("category", "documentation"))) {
  console.log(row.key, row.title.value)
}
