import { createPublicClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, asc, eq, gt } from "@arkiv-network/sdk/query"
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

// Read one of them by key, with every column
const first = result.entities[0]
if (first) {
  const post = await publicClient.getEntity(first.$key, Posts)
  console.log("First post:", post)
}

// Page through every post in the category, 20 at a time. Count them first to know how many pages
// there are. The count includes entities that don't fit the schema, and so do the offsets, so the
// two line up.
const PAGE_SIZE = 20
const total = await publicClient.count().from(Posts).where(eq("category", "docs")).fetch()
const pageCount = Math.ceil(Number(total) / PAGE_SIZE)
console.log(`${total} posts, ${PAGE_SIZE} per page`)

for (let n = 0; n < pageCount; n++) {
  const page = await publicClient
    .select({ $key: true, title: true })
    .from(Posts)
    .where(eq("category", "docs"))
    .orderBy(asc("$key"))
    .limit(PAGE_SIZE)
    .offset(n * PAGE_SIZE)
    .fetch()
  console.log(`Page ${n + 1}:`)
  for (const row of page.entities) console.log(" ", row.$key, row.title.value)
}
