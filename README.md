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

For this tutorial, we recommend using Node.js version 22.10.0 or newer (see [nodejs.org](https://nodejs.org)).  
Alternatively, you can use [`bun`](https://bun.sh/), a JavaScript/TypeScript runtime and package manager that natively supports TypeScript without transpilation.

### Project Setup

Create a new directory and navigate into it:
```bash
mkdir arkiv-sample
cd arkiv-sample
```

Create an empty `read_example.ts` file:
```bash
touch read_example.ts
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

Modify the `"main"` entry to `"read_example.ts"` and set `"type"` to `"module"` so your `package.json` looks like this:

```json
{
  "name": "arkiv-sample",
  "version": "1.0.0",
  "description": "",
  "license": "ISC",
  "author": "",
  "type": "module",
  "main": "read_example.ts",
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

### Public Client Example (Query Data)

You can now use Arkiv's public client to query data. Paste the following in `read_example.ts`:

```typescript
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { and, eq, gt } from "@arkiv-network/sdk/query"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { http } from "viem"

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

const publicClient = createPublicClient({
  chain: tiramisu, // "tiramisu" is Arkiv's testnet
  transport: http(),
});

// Get an entity by key, read through the schema
const post = await publicClient.getEntity('0xcadb830a3414251d65e5c92cd28ecb648d9e73d85f2203eff631839d5421f9d7', Posts);
console.log('Title:', post.title.value);

// Build and execute a query: select what to return, name the schema, then filter
const result = await publicClient
  .select({ $key: true, author: true, title: true, body: true })
  .from(Posts)
  .where(and(eq('category', 'docs'), gt('score', dec('4.0'))))
  .limit(10)
  .fetch();

for (const row of result.entities) {
  console.log(row.$key, row.author.value, row.title.value);
}

// Pagination
if (result.hasNextPage()) {
  const nextPage = await result.next();
  console.log('Next page:', nextPage.entities);
}

// Or walk every page at once
for await (const row of publicClient
  .select({ $key: true, title: true })
  .from(Posts)
  .where(eq('category', 'docs'))) {
  console.log(row.$key, row.title.value);
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

You have several options to run your TypeScript sample:

- **With Node.js (using experimental TypeScript support):**
  ```bash
  node --experimental-strip-types read_example.ts
  ```

- **With Bun (native TypeScript support):**
  ```bash
  bun read_example.ts
  ```

- **Classic Node.js (using transpilation to JavaScript):**

  1. Install TypeScript if you haven't already:
     ```bash
     npm install typescript
     ```
  2. Initialize a TypeScript config with default settings:
     ```bash
     npx tsc --init
     ```
     This will create a `tsconfig.json` file. You do not need to change its contents.
  3. Transpile your `.ts` files into `.js`:
     ```bash
     npx tsc --outDir dist
     ```
     This creates a `dist` directory containing `read_example.js` (the transpiled code), along with corresponding type declaration and source map files.
  4. Run the transpiled script:
     ```bash
     node dist/read_example.js
     ```

### Wallet Client Example (Create an Entity)

Now let's add storage (write) functionality.  
Create a file named `write_example.ts` with the following content:

```typescript
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
import { http, stringToBytes } from "viem"
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

// Create a public client
const publicClient = createPublicClient({
  chain: tiramisu, // tiramisu is the Arkiv testnet
  transport: http(),
})
// Create a wallet client with an account
const client = createWalletClient({
  chain: tiramisu,
  transport: http(),
  account: privateKeyToAccount('0x...'), // Replace with your private key
});

// Create an entity. Every required column must be given; a defaulted one (mimeType) left out is
// written with its default. Values carry their type: use the constructors from
// "@arkiv-network/sdk/schema", or a bare string, boolean, number, bigint or Uint8Array where it is
// unambiguous (string -> str, Uint8Array -> bytes, ...).
const { entityKey, txHash } = await client.createEntity(
  Posts,
  {
    author: addr(client.account.address),
    category: 'docs',
    score: dec('4.5'),
    title: 'Hello from Arkiv',
    body: stringToBytes('# Hello\n\nArkiv wishes you all the best!'),
  },
  { expiration: ExpirationTime.fromDays(30) }, // Entity expires in 30 days
);

console.log('Created entity:', entityKey);
console.log('Transaction hash:', txHash);

// Change one column, leaving the rest alone
await client.patchEntity(Posts, entityKey, { set: { score: dec('4.7') } });

const post = await publicClient.getEntity(entityKey, Posts);
console.log('Post:', post);
```

Now you can run it in the same way as in the previous example:
- **With Node.js (using experimental TypeScript support):**
  ```bash
  node --experimental-strip-types write_example.ts
  ```

- **With Bun (native TypeScript support):**
  ```bash
  bun write_example.ts
  ```

- **Classic Node.js (using transpilation to JavaScript):**
  ```bash
  npx tsc --outDir dist
  node dist/write_example.js
  ```

**Note:**  
You must provide your own private key with a minimum balance on the Arkiv L3 network.  
You can generate a private key using any tool, for example: https://vanity-eth.tk/  
Once you have a key, you can paste it into the example above and fund its address on the Arkiv Tiramisu testnet.

For quick testing, you may use this example key:
```
0x3d05798f7d11bb1c10b83fed8d3b4d76570c31cd66c8e0a8d8d991434c6d7a5e
```
However, funds may not always be available for this key.

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


