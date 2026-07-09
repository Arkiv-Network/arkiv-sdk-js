## [0.7.0] - 2026-07-09

### Added
- `select()` API on the public client for building queries that fetch only the fields you need. The result type is inferred from the selection
- Query builder predicates (`and`, `or`) now accept varargs in addition to the array syntax
- Invalid inputs are now rejected client-side with descriptive errors instead of failing during RPC communication

### Changed
- **Breaking:** `viem` is now a peer dependency and must be installed alongside the SDK (`npm install @arkiv-network/sdk viem`). The SDK no longer re-exports viem's internals (`http`, `privateKeyToAccount`, `Hex`, etc.)
- Relaxed the TypeScript peer dependency to `>=5.0.0` and made it optional

### Deprecated
- `orderBy` on the query builder, the `orderBy` query option, and the `asc`/`desc` helpers. Server-side ordering is not supported by the network, so these have no effect - sort the fetched entities in JavaScript instead.

## [0.6.3] - 2026-05-11

### Fixed
- Type mismatch in getBlockTiming https://github.com/Arkiv-Network/arkiv-sdk-js/issues/62


## [0.6.6] - 2026-05-06

### Added
- Braga testnet


## [0.6.3] - 2026-03-09

### Added
- Creator field in query requests and results

### Fixed
- When using TTL as odd number, mutating entities fails https://github.com/Arkiv-Network/arkiv-sdk-js/issues/28


## [0.6.0] - 2022-02-19

### Changed
- All numeric values are now represented as Hex for RPC communication (https://github.com/Arkiv-Network/arkiv-sdk-js/issues/19)


## [0.5.3] - 2025-11-21

### Added
- `chainFromName` - utility function allowing to get a predefined chain by its name, convenient to get chain based on env variable (https://github.com/Arkiv-Network/arkiv-sdk-js/issues/12)
- `QueryOptions` for `query(rawQuery: string)` public client's function allowing to setup what will be returned and more things like pagination
- Results for `query(...)` function with raw query now returns not only entities but also cursor and block number


### Changed
- Replaced `debug` module dependency with custom logger implementation that works in both Node.js and browser environments without bundler configuration issues
- Consolidated error classes exported from main index: `EntityMutationError`, `NoMoreResultsError`, `NoCursorOrLimitError`, `NoEntityFoundError`

### Fixed
- Fixed browser compatibility issue with `debug` module causing "exports is not defined" errors in browser environments
- Improved error handling for reverted transactions when using MetaMask as transport - now throws more descriptive errors (https://github.com/Arkiv-Network/arkiv-sdk-js/issues/16)
- Fix error while using value=0 with numeric attributes
