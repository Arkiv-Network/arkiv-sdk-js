# arkivjs

A TypeScript client library for Arkiv's blockchains interactions.
The Arkiv SDK builds strongly on the [Viem](https://github.com/wevm/viem) library - it extends Viem's clients with Arkiv's chain-specific features.

[`viem`](https://viem.sh) is a **peer dependency**: install it alongside the SDK.

## Installation

```bash
npm install @arkiv-network/sdk viem
# or
pnpm install @arkiv-network/sdk viem
# or
bun add @arkiv-network/sdk viem
# or
yarn add @arkiv-network/sdk viem
```

## Usage

Below is a tutorial to help you create simple scripts that use Arkiv to query and write data.

### Prerequisites

- **Node.js 22.10.0 or newer** (see [nodejs.org](https://nodejs.org)), or [`bun`](https://bun.sh/), a JavaScript/TypeScript runtime and package manager that natively supports TypeScript without transpilation.
- **An Arkiv access key.** Arkiv's public RPC is heavily rate limited to prevent abuse, so we recommend getting a free access key at [hub.arkiv.network/access-keys](https://hub.arkiv.network/access-keys).
- **Some testnet funds.** Writing an entity is a transaction, and its gas is paid in testnet tGLM. Get some for your account's address from the faucet at [hub.arkiv.network/faucet](https://hub.arkiv.network/faucet). [Project Setup](#project-setup) shows how to create an account if you don't have one.

### Project Setup

Create a new directory and navigate into it:
```bash
mkdir arkiv-sample
cd arkiv-sample
```

Create an empty `example.ts` file:
```bash
touch example.ts
```

Initialize a new JavaScript/TypeScript project:
```bash
npm init
```
You can accept all the default options by pressing `Enter` at each prompt.
After this step, a `package.json` file will be created with content similar to:

```json
{
  "name": "arkiv-sample",
  "version": "1.0.0",
  "description": "",
  "license": "ISC",
  "author": "",
  "type": "commonjs",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

Modify the `"main"` entry to `"example.ts"` and set `"type"` to `"module"` so your `package.json` looks like this:

```json
{
  "name": "arkiv-sample",
  "version": "1.0.0",
  "description": "",
  "license": "ISC",
  "author": "",
  "type": "module",
  "main": "example.ts",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

Install `@arkiv-network/sdk` along with its `viem` peer dependency using your preferred package manager:
```bash
npm install @arkiv-network/sdk viem
```
This command will update your `package.json` with a section like:
```json
"dependencies": {
  "@arkiv-network/sdk": "^0.9.0",
  "viem": "^2.38.2"
}
```
It will also create a `node_modules` directory with all dependencies installed.

If you don't have a testnet account yet, create one with viem. This prints a new private key and its address:
```bash
node --input-type=module -e "import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'; const key = generatePrivateKey(); console.log('Private key:', key); console.log('Address:', privateKeyToAccount(key).address)"
```
Fund the address at the [faucet](https://hub.arkiv.network/faucet).

Finally, create a `.env` file with your access key and private key. The example reads them from there, so neither ends up in your code:
```bash
ARKIV_ACCESS_KEY=your-access-key
PRIVATE_KEY=0x-your-private-key
```

### Define a Schema

Arkiv stores entities, and an entity is a set of named, typed attributes. You describe them once in a
schema, much as you would describe a table's columns in SQL, and choose per column whether the node
indexes it. Only indexed columns can be filtered on; the rest are stored and selectable, and do not
pay for an index.

The examples below use this schema for blog posts. Each example declares it at the top of its own
file, so that it runs as a single file under Node.js, Bun or `tsc` alike:

```typescript
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"

// Called with no arguments, a type constructor describes a column.
const Posts = defineSchema("posts", {
  author:    addr().indexed(),
  category:  str().indexed(),
  score:     dec().indexed(),
  title:     str(),                          // stored, not indexed
  body:      bytes(),                        // a blob; bytes can never be indexed
  thumbnail: bytes().optional(),             // any number of bytes columns; this one may be absent
  mimeType:  str().default("text/markdown"), // written on create when left out
})
```

The type constructors are `bool`, `i32`, `u64`, `u256`, `dec`, `str`, `addr`, `key` and `bytes`.
Each column may be refined with `.indexed()` (every type but `bytes`), `.optional()` and
`.default(...)`.

The same constructors, called with a value, make a typed value: `dec("4.1")` is a decimal, the way SQL
has `DECIMAL` as a type and `DECIMAL '4.1'` as a literal.

A schema is an SDK-side convention: the node sees only attributes, each with a type and an indexed
flag. The schema is what types your writes and reads, and checks them at runtime.

The name, `"posts"`, is optional but recommended. A named schema tags every entity it creates with
an indexed `arkiv.schema` attribute holding its name, and a query through it only matches entities
with that tag — the way a collection keeps one model's documents apart from another's. For that
reason `arkiv.schema` cannot be used as a column name.

### Create an Entity

Paste the following in `example.ts`. It sets up a public client, which reads, and a wallet client, which signs and sends transactions, then creates a post through the schema:

```typescript
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { hexToString, http, isHex, stringToBytes } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// The schema from "Define a Schema" above
const Posts = defineSchema("posts", {
  author:    addr().indexed(),
  category:  str().indexed(),
  score:     dec().indexed(),
  title:     str(),
  body:      bytes(),
  thumbnail: bytes().optional(),
  mimeType:  str().default("text/markdown"),
})

// Rabdi is the Arkiv testnet
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error("Set PRIVATE_KEY in .env to the private key of a funded testnet account")
}
const account = privateKeyToAccount(privateKey)

const publicClient = createPublicClient({ chain, transport: http() })
const walletClient = createWalletClient({ chain, transport: http(), account })

// Create an entity. Every required column must be given; a defaulted one (mimeType) left out is
// written with its default. Values carry their type: use the constructors from
// "@arkiv-network/sdk/schema", or a bare string, boolean, number, bigint or Uint8Array where it is
// unambiguous (string -> str, Uint8Array -> bytes, ...). createEntity resolves once the
// transaction is in a block.
const { entityKey, txHash } = await walletClient.createEntity(
  Posts,
  {
    author: addr(account.address),
    category: "docs",
    score: dec("4.5"),
    title: "Hello from Arkiv",
    body: stringToBytes("# Hello\n\nArkiv wishes you all the best!"),
  },
  { expiration: ExpirationTime.fromDays(1) }, // the entity expires in a day
)
console.log("Created entity:", entityKey)
console.log("Transaction hash:", txHash)

// Change one column, leaving the rest alone
await walletClient.patchEntity(Posts, entityKey, { set: { score: dec("4.7") } })
```

### Query It

Now read the post back. Add the following to the end of `example.ts`:

```typescript
// Get the entity by key, read through the schema
const post = await publicClient.getEntity(entityKey, Posts)
console.log("Title:", post.title.value, "score:", post.score.value)

// Or find it with a query: select what to return, name the schema, then filter
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

// Pagination
if (result.hasNextPage()) {
  const nextPage = await result.next()
  console.log("Next page:", nextPage.entities)
}

// Or walk every page at once
for await (const row of publicClient
  .select({ $key: true, title: true })
  .from(Posts)
  .where(eq("category", "docs"))
  .ownedBy(account.address)) {
  console.log(row.$key, row.title.value)
}
```

#### Selecting fields with `select()`

Pass nothing (or `"*"`) to fetch everything — through a schema, every entity field and every
column — or pass an object to fetch only specific fields. The selection names entity fields and
attributes side by side, and each result is a flat row. Entity fields start with `$`, as they do in
`where`: `$key`, `$owner`, `$creator`, `$createdAt`, `$updatedAt`, `$expiresAt` and
`$creationFlags`. Any other name is an attribute. An attribute name cannot start with `$`, so the
two never collide — an attribute called `owner` is just `owner`:

```typescript
// Every entity field and every column
await publicClient.select().from(Posts).where(eq("category", "docs")).fetch();

// Only the fields you need
await publicClient.select({ $key: true, title: true }).from(Posts).where(eq("category", "docs")).fetch();
```

**Select only what you need.** Every selected field is fetched over the network, so requesting
data you won't use makes queries slower. Narrowing the selection keeps responses small and fast.

The result type is inferred from your selection and schema: each column is typed as the schema
declares it, and reading a field you didn't select is a compile error.

```typescript
const row = (
  await publicClient.select({ $owner: true, score: true }).from(Posts).where(eq("category", "docs")).fetch()
).entities[0]!;
row.$owner;   // ✅ Hex
row.score;    // ✅ DecValue — row.score.value is "4.1"
row.title;    // ❌ compile error — not selected
```

`where` is checked against the schema too. It takes the schema's indexed columns and the system
attributes `$key`, `$owner`, `$creator` and `$expiresAt`. Filtering on a column the schema does not
index, or comparing a column against a value of another type, is a compile error:

```typescript
.where(eq("title", "x"))   // ❌ title is not indexed
.where(eq("score", 5))     // ❌ score is a dec, 5 is an i32 — write dec(5)
.where(between("score", dec(1), 5))  // ❌ both bounds need one type
```

Sort with `orderBy`, passing one key: an `asc(...)` or a `desc(...)`. Calling `orderBy` again
replaces the order. The node sorts the attribute as one type, so the key has a type: through a schema it is
the column's, and the system attributes `$key`, `$owner`, `$creator` and `$expiresAt` have fixed
ones. Without a schema, write it. Call `orderBy` after `from(...)`, so the compiler can check the
key against the schema; a key given before it is checked only when the query is sent:

```typescript
import { asc, desc } from "@arkiv-network/sdk/query"

.from(Posts).orderBy(desc("score"))      // score:dec DESC
.from(Posts).orderBy(asc("title"))       // title:str ASC, indexed or not
.from(Posts).orderBy(asc("$expiresAt"))  // $expiresAt:u64 ASC
.where(eq("category", "docs")).orderBy(desc("score", "dec"))  // without a schema
.from(Posts).orderBy(asc("body"))    // ❌ bytes cannot be sorted on
.from(Posts).orderBy(desc("$createdAt"))  // ❌ $createdAt cannot be sorted on
.from(Posts).orderBy(desc("score"), asc("$key"))  // ❌ one key only
```

Any column but a `bytes` one can be sorted on, indexed or not. An entity where the attribute is unset, or set with
another type, has no value to sort by, and sorts below every value: first with `asc`, last with
`desc`. The order holds across the whole walk, not each page on its own.

A named schema needs no `where` at all — `select().from(Posts)` matches every post: `fetch()`
returns the first page, and `for await` walks them all. An unnamed schema types a query without
filtering it, so `where` alone decides which entities match.

Only what you select is checked. An entity that matches but does not fit the schema — a selected
column that is required but missing or holds another type, or, for a named schema, another schema's
tag — is left out of the page. Anyone can write an entity a query matches, so one that does not
fit never fails the read of the others. A page can then hold fewer rows than its limit, and reports
how many it left out as `skipped`. Pass `{ onMismatch: "throw" }` to fail the fetch with a
`SchemaMismatchError` instead:

```typescript
const page = await publicClient.select().from(Posts).where(eq("category", "docs")).fetch();
page.skipped; // matching entities on this page that did not fit Posts
```

A query reads the same without a schema — say, to explore what a node holds. Leave out
`.from(...)` and the selection means what it did (save `"*"`, below), and the rows keep their
shape. Only the checking is gone, along with a named schema's tag filter: each attribute comes back
as whatever value the entity holds, or `undefined`, and `where` takes any attribute:

```typescript
const row = (
  await publicClient.select({ $key: true, title: true }).where(eq("category", "docs")).fetch()
).entities[0]!;
row.title;    // ArkivValue | undefined — e.g. { type: "str", value: "Hello" }
```

To read every attribute without naming them, select `$attributes`, a map of all of them. `"*"` (or
nothing) fetches it alongside the entity fields when there is no schema, since there are no columns
to list.

`$attributeSchema` is for finding out what entities hold without fetching their values: each
attribute's name, its type, and whether it is indexed. Values can be large — a `bytes` attribute
holds up to 128 KiB — and an RPC endpoint may cap how big a response it sends, so a page of 100
entities with every attribute can be more than it will return. Fetch the schema first, then select
the attributes you need by name. It is never part of `"*"`; select it by name:

```typescript
const page = await publicClient.select({ $key: true, $attributeSchema: true }).where(eq("category", "docs")).fetch();
page.entities[0]?.$attributeSchema; // { title: { type: "str", indexed: false }, body: { type: "bytes", indexed: false } }
```

Both work through a schema too.

> **Footgun:** pass the selection inline. A selection stored in a variable widens its `true` values
> to `boolean`, so which fields come back is only known at runtime and every field of the result is
> optional. If you need to reuse one, annotate it `as const`:
> ```typescript
> const fields = { $owner: true, title: true } as const;
> await publicClient.select(fields).from(Posts).where(eq("category", "docs")).fetch();
> ```

### Running the Example

You have several options to run your TypeScript sample. Each loads your `.env` file:

- **With Node.js (using experimental TypeScript support):**
  ```bash
  node --env-file=.env --experimental-strip-types example.ts
  ```

- **With Bun (native TypeScript support, loads `.env` on its own):**
  ```bash
  bun example.ts
  ```

- **Classic Node.js (using transpilation to JavaScript):**

  1. Install TypeScript and the Node.js type definitions if you haven't already:
     ```bash
     npm install typescript @types/node
     ```
  2. Initialize a TypeScript config with default settings:
     ```bash
     npx tsc --init
     ```
     This will create a `tsconfig.json` file. Set `"types": ["node"]` in it, so that `process.env` type-checks.
  3. Transpile your `.ts` files into `.js`:
     ```bash
     npx tsc --outDir dist
     ```
     This creates a `dist` directory containing `example.js` (the transpiled code), along with corresponding type declaration and source map files.
  4. Run the transpiled script:
     ```bash
     node --env-file=.env dist/example.js
     ```

Sample code can also be found in the [`sample`](./sample) directory of this repository.

## Package Distribution

This package supports multiple module formats for maximum compatibility:

- **ES Modules** (`dist/*.js`) - For modern `import` statements
- **CommonJS** (`dist/*.cjs`) - For Node.js `require()`
- **Type Declarations** (`dist/*.d.ts` and `dist/*.d.cts`) - Full TypeScript support

The build uses [tsdown](https://github.com/rolldown/tsdown) to generate both ESM and CommonJS formats with proper type declarations.

### Runtime Support


**Node.js (ESM):**
```javascript
import { createPublicClient } from '@arkiv-network/sdk';  // Uses compiled ESM
```

**Node.js (CommonJS):**
```javascript
const { createPublicClient } = require('@arkiv-network/sdk');  // Uses compiled CJS
```

**Bun (TypeScript native):**
```javascript
import { createPublicClient } from '@arkiv-network/sdk'; // Uses *.ts directly
```

All formats provide full type safety and IntelliSense support when using TypeScript.

## Development

To install dependencies:

```bash
bun install
```

To build all outputs (ESM, CommonJS, and type declarations):

```bash
bun run build
```

For more information about building this SDK refer to:
[BUILD.md](./BUILD.md)


To run type checking:

```bash
bun run type-check
```

To lint:

```bash
bun run lint
```

For more information about refer to:
[CONTRIBUTING.md](./CONTRIBUTING.md)

## Verbose Logging

Set the `DEBUG` environment variable (or, in a browser, the `DEBUG` key in `localStorage`) to view verbose logs:

```bash
DEBUG=arkiv:* bun run your-script
```

Adjust the namespace (for example, `arkiv:query:*` or `arkiv:actions:wallet:*`) to target specific log sources, and prefix one with `-` to exclude it. Unset `DEBUG` to silence debug output.
