# arkivjs

A TypeScript client library for Arkiv's blockchains interactions.
The Arkiv SDK base strongly on Viem (Viem)[https://github.com/wevm/viem] library - it can be treated as Viem replacement extended of Arkiv's chains specific features.

## Installation

```bash
npm install @arkiv-network/sdk
# or
pnpm install @arkiv-network/sdk
# or
bun add @arkiv-network/sdk
# or
yarn add @arkiv-network/sdk
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

Create an empty `index.ts` file:
```bash
touch index.ts
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

Modify the `"main"` entry to `"index.ts"` and set `"type"` to `"module"` so your `package.json` looks like this:

```json
{
  "name": "arkiv-sample",
  "version": "1.0.0",
  "description": "",
  "license": "ISC",
  "author": "",
  "type": "module",
  "main": "index.ts",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

Install `@arkiv-network/sdk` using your preferred package manager:
```bash
npm install @arkiv-network/sdk
```
This command will update your `package.json` with a section like:
```json
"dependencies": {
  "@arkiv-network/sdk": "^0.4.1"
}
```
It will also create a `node_modules` directory with all dependencies installed.

### Public Client Example (Query Data)

To query data from Arkiv, use the following sample code in `index.ts`:

```typescript
const publicClient = createPublicClient({
  chain: mendoza, // "mendoza" is Arkiv's testnet, used during hackathons at DevConnect 2025 in Buenos Aires
  transport: http(),
});

// Get chain ID
const chainId = await publicClient.getChainId();
console.log('Chain ID:', chainId);

// Get entity by key
const entity = await publicClient.getEntity('0xcadb830a3414251d65e5c92cd28ecb648d9e73d85f2203eff631839d5421f9d7');
console.log('Entity:', entity);

// Build and execute a query using QueryBuilder
const query = publicClient.buildQuery();
const result = await query
  .where(eq('category', 'documentation'))
  .ownedBy('0x6186B0DbA9652262942d5A465d49686eb560834C')
  .withAttributes(true)
  .withPayload(true)
  .limit(10)
  .fetch();

console.log('Found entities:', result.entities);

// Pagination - fetch next page
if (result.hasNextPage()) {
  await result.next();
  console.log('Next page:', result.entities);
}
```

### Running the Example

You have several options to run your TypeScript sample:

- **With Node.js (using experimental TypeScript support):**
  ```bash
  node --experimental-strip-types index.ts
  ```

- **With Bun (native TypeScript support):**
  ```bash
  bun index.ts
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
     This creates a `dist` directory containing `index.js` (the transpiled code), along with corresponding type declaration and source map files.
  4. Run the transpiled script:
     ```bash
     node dist/index.js
     ```

### Wallet Client Example (Create Entity)

Now, let's add storage functionality.  
First, import the required modules at the top of your `index.ts`:

```typescript
import { createWalletClient } from '@arkiv-network/sdk';
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils';
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts';
```

Then, add the following example below your query code to create an entity:

```typescript
// Create a wallet client with an account
const client = createWalletClient({
  chain: mendoza,
  transport: http(),
  account: privateKeyToAccount('0x...'), // Replace with your private key
});

// Create an entity
const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({
    entity: {
      entityType: 'document',
      entityId: 'doc-123',
      entityContent: "Hello from DevConnect Hackathon 2025! Arkiv Mendoza chain wishes you all the best!"
    },
  }),
  contentType: 'application/json',
  attributes: [
    { key: 'category', value: 'documentation' },
    { key: 'version', value: '1.0' },
  ],
  expiresIn: ExpirationTime.fromDays(30), // Entity expires in 30 days
});

console.log('Created entity:', entityKey);
console.log('Transaction hash:', txHash);

const newEntity = await publicClient.getEntity(entityKey);
console.log('Entity:', newEntity);
```

**Note:**  
You must provide your own private key with a minimum balance on the Arkiv L3 network.  
You can generate a private key using any tool, for example: https://vanity-eth.tk/  
Once you have a key, you can paste it into the example above and fund its address using the Arkiv Mendoza testnet faucet at:  
https://mendoza.hoodi.arkiv.network/faucet/

For quick testing, you may use this example key:
```
0x3d05798f7d11bb1c10b83fed8d3b4d76570c31cd66c8e0a8d8d991434c6d7a5e
```
However, funds may not always be available for this key.

The full example code can be found in the `sample` directory of this repository.

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

