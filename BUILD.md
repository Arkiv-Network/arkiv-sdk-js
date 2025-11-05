# Build Configuration

This project uses [tsdown](https://github.com/unjs/tsdown) to generate CommonJS, ESM, and TypeScript declaration files from a single TypeScript codebase.

## Build Output Structure

```
dist/
├── *.js           # ES Modules (for import statements)
├── *.cjs          # CommonJS modules (for Node.js require())
├── *.d.ts         # TypeScript declarations for ESM
├── *.d.cts        # TypeScript declarations for CommonJS
└── [subdirs]/     # Subpath exports (accounts, chains, query, etc.)
```

All build outputs are organized directly in `dist/` with different file extensions to distinguish formats.

## Build Process

The build uses **tsdown** configured in `tsdown.config.ts`:

- **Single pass build** - Generates both ESM and CommonJS formats simultaneously
- **Type declarations** - Automatically generates `.d.ts` (ESM) and `.d.cts` (CommonJS) files
- **Source maps** - Includes `.js.map` and `.d.ts.map` files for debugging
- **Platform neutral** - Supports both browser and Node.js environments
- **External dependencies** - Properly handles external packages like `brotli-wasm`

## Scripts

```bash
# Build all outputs (ESM + CJS + Types)
bun run build

# Type-check without emitting files
bun run type-check

# Package for distribution
bun run package
bun run package:test  # Creates arkiv-network-sdk-latest.tgz for testing
```

## Package Exports

The library supports multiple module formats via package.json exports with conditional exports:

```json
{
  "main": "./dist/index.cjs",      // CommonJS entry (legacy)
  "module": "./dist/index.js",     // ESM entry (legacy)
  "types": "./dist/index.d.cts",   // TypeScript types (legacy)
  "exports": {
    ".": {
      "bun": "./src/index.ts",     // Bun uses TypeScript source
      "import": "./dist/index.js", // Node.js ESM
      "require": "./dist/index.cjs" // Node.js CommonJS
    }
  }
}
```

### Subpath Exports

All major subpaths are exported:
- `.` - Main entry
- `./chains` - Chain configurations
- `./accounts` - Account utilities
- `./utils` - Utility functions
- `./query` - Query builder
- `./types` - Type definitions

Each export provides **3 resolution paths**:
- `bun` - TypeScript source files from `src/*.ts` (for Bun runtime or experimental feature of Node)
- `import` - ES Modules from `dist/*.js` with types from `dist/*.d.ts` (for Node.js ESM)
- `require` - CommonJS from `dist/*.cjs` with types from `dist/*.d.cts` (for Node.js CommonJS)

### Runtime Support

**Bun (TypeScript native):**
```javascript
import { createPublicClient } from '@arkiv-network/sdk';  // Uses src/*.ts directly
```
Bun automatically resolves to the `bun` export condition, which points to TypeScript source files. No transpilation needed!

**Node.js (ESM):**
```javascript
import { createPublicClient } from '@arkiv-network/sdk';  // Uses dist/*.js
```

**Node.js (CommonJS):**
```javascript
const { createPublicClient } = require('@arkiv-network/sdk');  // Uses dist/*.cjs
```

## Why tsdown?

This configuration provides:
1. **Maximum compatibility** - Supports CJS, ESM, and TypeScript-native runtimes (Bun)
2. **Single build tool** - One command generates all formats and types
3. **Zero transpilation for Bun** - Bun can use TypeScript source files directly from the package
4. **Tree-shaking** - ESM allows bundlers to optimize imports
5. **Type safety** - Full TypeScript support with declaration maps for both formats
6. **Source maps** - Easy debugging with `.js.map` and `.d.ts.map` files
7. **Clean structure** - All build outputs organized in `dist/` with clear file extensions
8. **Fast builds** - Efficient single-pass compilation

## Development

When working on the library:

1. Source files live in `src/`
2. Run `bun run build` to compile with tsdown
3. Outputs go to `dist/` (gitignored)
4. Package includes both `src/` and `dist/` directories:
   - `src/` - TypeScript source files for Bun runtime (via `bun` export condition)
   - `dist/` - Compiled ESM, CJS, and type declarations for Node.js

The build configuration is defined in `tsdown.config.ts` and handles:
- Multiple entry points (`src/**/index.ts`)
- ESM and CommonJS output formats
- Type declaration generation
- External dependency handling
- Source map generation

Note: The `src/` folder is included in the published package (via `package.json` `files` field) to enable Bun's zero-transpilation workflow, where Bun can directly import and execute TypeScript files.

