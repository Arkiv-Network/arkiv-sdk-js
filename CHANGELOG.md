## [0.8.0] - 2026-08-14

This release tracks the arkiv-reth engine and rewrites most of the SDK surface. Every entity write, every attribute and every event changed shape - expect to touch code that used 0.7.x.

### Added
- Attribute type system, exported from `@arkiv-network/sdk/attr`. Attribute values are now tagged: `str`, `i32`, `u64`, `u256`, `dec`, `addr`, `key`, `bytes32`, `bool`. A bare `boolean`, `number`, `bigint` or `string` is still accepted where the type is unambiguous. `dec` carries fixed-point decimals without precision loss, so numeric ordering and range queries work on non-integers
- Entity module, exported from `@arkiv-network/sdk/entity`: expiries (`Expiry`, `Lifetime`, `resolveExpiry`, `toBlocks`), creation flags (`encodeCreationFlags`, `decodeCreationFlags`), key derivation (`predictEntityKey`, `randomSalt`) and the protocol bounds behind them
- `patchEntity()` on the wallet client - sets and unsets individual attributes and replaces `payload`/`contentType`, leaving everything it does not name untouched
- `predictEntityKeys()` on the public client - returns the `{ key, salt }` pairs an account's next creates will be given, so a batch can reference an entity it is about to mint
- `getEntityNonce()` on the public client - the account's entity-minting nonce
- `watchEntityEvents()` on the public client, with typed handlers for `onEntityCreated`, `onEntityPatched`, `onExpiryExtended`, `onOwnershipTransferred` and `onEntityDeleted`, plus `onEvent` for all of them. Each event carries the block, transaction and log index it came from
- Creation flags on `createEntity()`: `readonly` and `permissionlessExtension`, fixed at creation for the entity's life
- Explicit `salt` on `createEntity()`. It defaults to 128 random bits; pass `0n` for a key derived from owner and nonce alone, which anyone can compute in advance
- `ExpirationTime.atBlock()`, `ExpirationTime.atDate()` and `ExpirationTime.permanent()` for absolute deadlines, each able to carry an `{ atLeast }` floor
- New selectable entity fields: `createdAt`, `updatedAt`, `expiresAt`, `creationFlags` and `attributeSchema`. `attributes` also takes a map of names to fetch only those: `select({ key: true, attributes: { projectId: true } })`
- Query results are async iterable - `for await (const entity of client.select({ key: true }).where(...))` walks every page
- Expression combinators exported from `@arkiv-network/sdk/query`: `and`, `or`, `not`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `exists`, `startsWith`, `hasType` and `render`. `client.query()` accepts an `Expression` as well as a raw string
- Cheesecake testnet
- Engine reverts are decoded into messages that name the actual problem instead of printing the raw error args

### Changed
- **Breaking:** attributes are an object keyed by name (`{ category: 'docs', level: i32(10) }`), not an array of `{ key, value }` pairs.
- **Breaking:** `expiresIn` is now `expires` on `createEntity()`, `extendEntity()` and every batch operation, and takes an `Expiry` built with `ExpirationTime`. The `ExpirationTime.from*` helpers return an `Expiry` instead of a number of seconds
- **Breaking:** entity metadata fields were renamed: `createdAtBlock` is `createdAt`, `lastModifiedAtBlock` is `updatedAt` and `expiresAtBlock` is `expiresAt`. `transactionIndexInBlock` and `operationIndexInTransaction` are gone
- **Breaking:** `getEntity()` returns a `FullEntity` with every field populated
- **Breaking:** `QueryOptions` now takes `select` (a selection) and `limit`, replacing `includeData` and `resultsPerPage`. Page size is capped at 200
- **Breaking:** `mutateEntities()` is now `executeBatch()`. It takes `patches` where it took `updates`, and gained `ownershipChanges`. `MutateEntitiesParameters` and `MutateEntitiesReturnType` are `ExecuteBatchParameters` and `ExecuteBatchReturnType`
- **Breaking:** `QueryResult.next()` returns the next page as a new `QueryResult` instead of mutating the current one
- `owner` and `creator` are returned as checksummed addresses
- Error types match the new operations: `InvalidExpiryError`, `InvalidValueError`, `InvalidAttributeNameError`, `ConflictingMutationError`, `EmptyPatchError`, `TooManyAttributesError`, `InvalidCreationFlagsError`, `InvalidSaltError`, `QueryError`
- `$expiresAt` is a `u64` system attribute

### Removed
- **Breaking:** `updateEntity()`. Use `patchEntity()`, which changes only what it names, or delete and recreate for a full replacement
- **Breaking:** `buildQuery()` and `QueryBuilder`, along with `withAttributes()`/`withMetadata()`/`withPayload()`. Use `select()`
- **Breaking:** `subscribeEntityEvents()`. Use `watchEntityEvents()`
- **Breaking:** `orderBy` on the query builder, the `orderBy` query option and the `asc`/`desc` helpers, deprecated in 0.7.0. Sort the fetched entities in JavaScript
- **Breaking:** the Kaolin and Braga testnets. Use Cheesecake
- **Breaking:** `InvalidExpirationError`, `InvalidAttributeError`, `InvalidAttributeKeyError`, `DuplicateAttributeError` and `NoCursorOrLimitError`

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
