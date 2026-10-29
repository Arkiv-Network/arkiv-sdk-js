import { createPublicClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { hexToString, http } from "viem"

// Reads the posts anyone has written, so it needs no account. Run write_example.ts first to add
// one of your own. Set ARKIV_ACCESS_KEY to a free key from https://hub.arkiv.network/access-keys.

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

// Rabdi is the Arkiv testnet. Without an access key, it uses the rate-limited public endpoint.
const publicClient = createPublicClient({
  chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }),
  transport: http(),
})

// Query through the schema. select() names entity fields and columns side by side, and the
// result rows are typed to exactly those. where() may only filter on indexed columns, compared
// against values of their type — eq("title", ...) would not compile, since title is not indexed.
const result = await publicClient
  .select({ $key: true, author: true, title: true, body: true })
  .from(Posts)
  .where(and(eq("category", "docs"), gt("score", dec("4.0"))))
  .limit(10)
  .fetch()

for (const row of result.entities) {
  console.log(row.$key, row.author.value, row.title.value, hexToString(row.body.value))
}

// Pagination
if (result.hasNextPage()) {
  const nextPage = await result.next()
  console.log("Next page:", nextPage.entities)
}

// Read one of them by key, with every column
const first = result.entities[0]
if (first) {
  const post = await publicClient.getEntity(first.$key, Posts)
  console.log("First post:", post)
}

// Or walk every page, one row at a time
for await (const row of publicClient
  .select({ $key: true, title: true })
  .from(Posts)
  .where(eq("category", "docs"))) {
  console.log(row.$key, row.title.value)
}
