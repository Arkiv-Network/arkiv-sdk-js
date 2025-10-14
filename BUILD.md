# Build Configuration

This project uses a **Viem-style** build setup with TypeScript compiler to generate CommonJS, ESM, and TypeScript declaration files.

## Build Output Structure

```
dist/
├── _cjs/          # CommonJS modules (for Node.js require())
├── _esm/          # ES Modules (for import statements)
└── _types/        # TypeScript declaration files
```

## Build Process

The build uses TypeScript's native compiler with three separate configurations:

- **`tsconfig.base.json`** - Shared base configuration
- **`tsconfig.cjs.json`** - CommonJS output (module: "commonjs")
- **`tsconfig.esm.json`** - ES Module output (module: "esnext")
- **`tsconfig.types.json`** - Type declarations only

## Scripts

```bash
# Build all outputs (CJS + ESM + Types)
bun run build

# Build individual outputs
bun run build:cjs
bun run build:esm
bun run build:types

# Type-check without emitting files
bun run type-check

# Package for distribution
bun run package
bun run package:test  # Creates arkiv-latest.tgz for testing
```

## Package Exports

The library supports multiple module formats via package.json exports:

```json
{
  "main": "./dist/_cjs/index.js",      // CommonJS entry
  "module": "./dist/_esm/index.js",    // ESM entry
  "types": "./dist/_types/index.d.ts"  // TypeScript types
}
```

### Subpath Exports

All major subpaths are exported:
- `arkiv` - Main entry
- `arkiv/chains` - Chain configurations
- `arkiv/accounts` - Account utilities
- `arkiv/utils` - Utility functions
- `arkiv/query` - Query builder

Each export provides **4 resolution paths**:
- `source` - Original TypeScript from `src/` (for Bun/Deno)
- `types` - TypeScript declarations from `dist/_types/`
- `import` - ES Modules from `dist/_esm/`
- `default` - CommonJS from `dist/_cjs/`

### Runtime Support

**Bun/Deno (TypeScript native):**
```bash
# Runs TypeScript directly from src/ - no transpilation!
bun run app.ts
```

**Node.js (ESM):**
```javascript
import { createPublicClient } from 'arkiv';  // Uses dist/_esm/
```

**Node.js (CommonJS):**
```javascript
const { createPublicClient } = require('arkiv');  // Uses dist/_cjs/
```

## Why This Setup?

This configuration matches Viem's build approach:
1. **Maximum compatibility** - Supports CJS, ESM, and TypeScript-native runtimes
2. **Zero transpilation** - Bun/Deno can run TypeScript source directly
3. **Tree-shaking** - ESM allows bundlers to optimize imports
4. **Type safety** - Full TypeScript support with declaration maps
5. **Source maps** - Easy debugging with `.js.map` and `.d.ts.map` files
6. **Clean structure** - All build outputs organized in `dist/`, source in `src/`

## Development

When working on the library:

1. Source files live in `src/`
2. Run `bun run build` to compile
3. Outputs go to `dist/` (gitignored)
4. Package includes both source and compiled files

