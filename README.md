# arkivjs

A TypeScript-only client library for GolemDB/Arkiv blockchain interactions.

## Installation

```bash
npm install arkivjs
# or
bun add arkivjs
# or
yarn add arkivjs
```

**Note**: This package requires TypeScript to be installed as a peer dependency.

## Usage

```typescript
import { createPublicClient, http } from 'arkivjs';

const client = createPublicClient({
  transport: http('http://localhost:8545'),
  name: 'GolemDB Client',
});

// Get chain ID
const chainId = await client.getChainId();

// Get entity by key
const entity = await client.getEntity({ key: 'my-entity-key' });
```

## TypeScript-Only Package

This package distributes TypeScript source files directly, not compiled JavaScript. This means:

- ✅ Full type safety and IntelliSense support
- ✅ No compilation step required for consumers
- ✅ Direct access to source code for debugging
- ⚠️ Requires TypeScript in your project

## Development

To install dependencies:

```bash
bun install
```

To build type declarations:

```bash
bun run build
```

To run type checking:

```bash
bun run type-check
```

To lint:

```bash
bun run lint
```
