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
  "@arkiv-network/sdk": "^0.6.0",
  "viem": "^2.38.2"
}
```
It will also create a `node_modules` directory with all dependencies installed.

### Public Client Example (Query Data)

You can now use Arkiv's public client to query data. Paste the following in `read_example.ts`:

```typescript
import { createPublicClient } from "@arkiv-network/sdk"
import { cheesecake } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"
import { http } from "viem"

const publicClient = createPublicClient({
  chain: cheesecake, // "cheesecake" is Arkiv's testnet
  transport: http(),
});

// Get chain ID
const chainId = await publicClient.getChainId();
console.log('Chain ID:', chainId);

// Get entity by key
const entity = await publicClient.getEntity('0xcadb830a3414251d65e5c92cd28ecb648d9e73d85f2203eff631839d5421f9d7');
console.log('Entity:', entity);

// Build and execute a query using select()
const result = await publicClient
  .select({ owner: true, attributes: true, payload: true })
  .where(eq('category', 'documentation'))
  .ownedBy('0x6186B0DbA9652262942d5A465d49686eb560834C')
  .limit(10)
  .fetch();

console.log('Found entities:', result.entities);

// Pagination
if (result.hasNextPage()) {
  const nextPage = await result.next();
  console.log('Next page:', nextPage.entities);
}

// Or walk every page at once
for await (const entity of publicClient
  .select({ key: true })
  .where(eq('category', 'documentation'))) {
  console.log(entity.key);
}
```

#### Selecting fields with `select()`

Pass nothing (or `"*"`) to fetch everything, or pass an object to fetch only specific fields:

```typescript
// All fields
await publicClient.select().where(eq("category", "docs")).fetch();

// Only the fields you need
await publicClient.select({ key: true, owner: true, payload: true }).where(eq("category", "docs")).fetch();
```

**Select only what you need.** Every selected field is fetched over the network, so requesting
data you won't use makes queries slower. Narrowing the selection keeps responses small and fast.

The result type is inferred from your selection: reading a field you didn't select is a compile error. The `toText()` / `toJson()` payload
helpers are available only when you select `payload`.

```typescript
const [entity] = (
  await publicClient.select({ owner: true, payload: true }).where(eq("category", "docs")).fetch()
).entities;
entity.owner;     // ✅ Hex
entity.toJson();  // ✅ payload was selected
entity.creator;   // ❌ compile error — not selected
```

> **Footgun:** pass the selection inline. A selection stored in a variable widens its `true` values
> to `boolean`, so the result type can't be narrowed (you get `{}` and a compile error on every
> field). If you need to reuse one, annotate it `as const`:
> ```typescript
> const fields = { owner: true, payload: true } as const;
> await publicClient.select(fields).where(eq("category", "docs")).fetch();
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

### Wallet Client Example (Create Entity)

Now let's add storage (write) functionality.  
Create a file named `write_example.ts` with the following content:

```typescript
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { dec, i32 } from "@arkiv-network/sdk/attr"
import { cheesecake } from "@arkiv-network/sdk/chains"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Create a public client
const publicClient = createPublicClient({
  chain: cheesecake, // cheesecake is the Arkiv testnet
  transport: http(),
})
// Create a wallet client with an account
const client = createWalletClient({
  chain: cheesecake,
  transport: http(),
  account: privateKeyToAccount('0x...'), // Replace with your private key
});

// Create an entity
const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({
    entity: {
      entityType: 'document',
      entityId: 'doc-123',
      entityContent: "Hello from DevConnect Hackathon 2025! Arkiv chain wishes you all the best!"
    },
  }),
  contentType: 'application/json',
  // Attributes are keyed by name. Values carry their type: use the tagged constructors from
  // "@arkiv-network/sdk/attr" (i32, u64, u256, dec, str, addr, key, bytes32, bool), or pass a bare
  // boolean, number, bigint or string where the type is unambiguous.
  attributes: {
    category: 'documentation',   // bare string -> str
    version: i32(1),
    score: dec('4.5'),
  },
  expires: ExpirationTime.fromDays(30), // Entity expires in 30 days
});

console.log('Created entity:', entityKey);
console.log('Transaction hash:', txHash);

const newEntity = await publicClient.getEntity(entityKey);
console.log('Entity:', newEntity);
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
Once you have a key, you can paste it into the example above and fund its address on the Arkiv Cheesecake testnet.

For quick testing, you may use this example key:
```
0x3d05798f7d11bb1c10b83fed8d3b4d76570c31cd66c8e0a8d8d991434c6d7a5e
```
However, funds may not always be available for this key.

Sample code can also be found in the [`sample`](./sample) directory of this repository.

### Advanced Path (Minimal RPC Calls)

The everyday actions (`createEntity`, `mutateEntities`, ...) bundle send + wait + decode into one
call, which is convenient but spends several RPC requests per mutation. The `client.advanced`
namespace unbundles them so you control every call yourself:

```typescript
// 1. Send — submits the transaction and returns the hash immediately. No waiting, no polling,
//    no revert diagnosis. Supply `currentBlock` and full `txParams` (nonce, gas, fees) and this
//    is exactly one RPC call: eth_sendRawTransaction.
const { txHash } = await client.advanced.sendMutation(
  { creates: [{ payload, contentType: "application/json", expires: ExpirationTime.fromDays(30) }] },
  {
    currentBlock,                                              // skip eth_blockNumber
    txParams: { nonce, gas, maxFeePerGas, maxPriorityFeePerGas }, // skip fee/nonce/gas lookups
  },
)

// 2. Ping — one eth_getTransactionReceipt, on your own schedule. Never polls.
const ping = await client.advanced.pingTransaction(txHash)
// { status: "pending" } | { status: "success" | "reverted", blockNumber }

// 3. Result — the same single call, decoded into entity keys and expiries.
const result = await client.advanced.getMutationResult(txHash)
if (result.status === "success") console.log(result.createdEntities, result.createdExpiries)

// Or, with a receipt you already hold (your own watcher, webhook...): zero RPC calls.
const decoded = client.advanced.decodeMutationResult(receipt)
```

For full offline control, `client.advanced.buildMutation(data, { currentBlock })` encodes the
batch with **zero** RPC calls and returns the `execute` calldata (`{ to, data }`) — sign it
yourself and the whole mutation costs a single `eth_sendRawTransaction`. Pair it with
`predictEntityKeys` to know the created keys before the transaction is even mined.

The checking half (`pingTransaction`, `getMutationResult`, `decodeMutationResult`) is also
available on the public client, so a keyless process can follow a transaction by hash alone.

A complete runnable walkthrough — manual nonce, gas and fee setup, the single-call send, and the
hand-rolled receipt check — is in
[`sample/write_example_advanced.ts`](./sample/write_example_advanced.ts).

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

The SDK uses [debug](https://www.npmjs.com/package/debug) under the hood. Set the `DEBUG` environment variable to view verbose logs:

```bash
DEBUG=arkiv:* bun run your-script
```

Adjust the namespace (for example, `arkiv:rpc` or `arkiv:query`) to target specific log sources. Unset `DEBUG` to silence debug output.


