## [Unreleased]

This release implements user-defined entity columns. An entity is no longer a payload plus indexed attributes: it is any number of named, typed attributes, each of which the writer marks indexed or not. The SDK describes them with schemas. It needs a node that speaks the new protocol (the indexed flag in bit 7 of `typeId`, no `$payload`/`$contentType`), so it does not work against current nodes.

### Added
- Schemas, exported from `@arkiv-network/sdk/schema`. `defineSchema({ ... })` declares an entity's columns. Each column is a type constructor called with no arguments (`str()`, `dec()`, `bytes()`, ...) and refined with `.indexed()`, `.optional()` and `.default(...)`. Called with a value, the same constructor still makes a typed value: `dec()` is a column, `dec("4.1")` is a value
- `bytes` is a user type: `bytes()` is a column, `bytes(value)` a value, and a bare `Uint8Array` is taken as one. Bytes are stored but never indexed. An entity may have as many bytes columns as `MAX_ATTRIBUTES` allows, each up to 128 KiB (`MAX_BYTES_LENGTH`). The bytes columns of one create or patch may hold at most 128 KiB together (`MAX_ENTITY_BYTES`, provisional until the protocol settles a per-entity cap); more throws `EntityTooLargeError`
- `select(...).from(schema)` on the query builder. The selection keeps its meaning and the rows their shape, but each selected attribute is typed and checked as the schema's column. The exception is `"*"` (or no selection), which through a schema means every entity field and every column rather than the `$attributes` map. A named schema also filters by its tag (below). `where` only accepts the schema's indexed columns and the queryable system attributes (`$key`, `$owner`, `$creator`, `$expiresAt`), compared against values of their type: anything else is a compile error and a runtime `InvalidPredicateError`. A matching entity whose selected columns do not fit the schema, or that does not carry a named schema's tag, is left out of the page, or fails the fetch with `SchemaMismatchError` with `onMismatch: "throw"`
- Named schemas: `defineSchema("posts", { ... })` tags every entity it creates with an indexed `arkiv.schema` attribute holding the name, and `.from()` filters on it, so a query through a named schema only sees entities written through it and needs no other filter. Reads check the tag too. `arkiv.schema` is a reserved column name, and the tag counts against `MAX_ATTRIBUTES`
- `.from(schema, { onMismatch })` decides what happens to a matching entity that does not fit the schema. `"skip"`, the default, leaves it out of the page, and `QueryResult.skipped` reports how many each page left out: anyone can write an entity a query matches, so one misfit should not fail every read. `"throw"` fails the fetch with `SchemaMismatchError`. `getEntity(key, schema)` always throws, since it reads one entity
- `getEntity(key, schema)` reads one entity through a schema
- `executeBatch()` creates and patches each name their own schema and are typed by it, so one batch can write entities of several schemas
- `SchemaDefinitionError`, `SchemaMismatchError`, `INDEXED_FLAG`, `SCHEMA_ATTRIBUTE`, `FromOptions`, `IndexableTypeTag`, `IndexableValue`, `DynamicSelection`, `PartialRow`
- Schema exports from `@arkiv-network/sdk/schema` and the package root: `Schema`, `Column`, `AnyColumn`, `Columns`, `ColumnsOf`, `ColumnInput`, `CreateEntityValues`, `PatchEntityValues`, `IndexedColumnName`, `OptionalColumnName`, `isSchema`, `isColumn`, `lookupColumn`
- Selection and row exports from `@arkiv-network/sdk/query`: the types `Selection`, `Row`, `FullRow`, `ResultOf`, `SelectionOf`, `NonEmptySelection`, `KnownSystemFields`, `Selected`, `SystemField`, `SchemaRef` and `AttributeRef` (also exported from the package root), and `SYSTEM_FIELDS` (also from the package root), `projectSelection` and `toRow`. `QueryRow` from `@arkiv-network/sdk/types` and the package root
- `between(name, low, high)`, an inclusive range test that matches what `and(gte(name, low), lte(name, high))` does, sent as `name BETWEEN low AND high`. Both bounds must have one type: mixed bounds are a compile error and throw `InvalidPredicateError`. `BetweenNode` is exported from `@arkiv-network/sdk/query`
- `client.count()` counts the entities a query matches without fetching them: a `CountQueryBuilder` that filters as `select()` does (`from`, `where`, `ownedBy`, `createdBy`, `atBlock`) and whose `fetch()` resolves to a `bigint`. `select(...).withCount()` adds the same total to every page as `QueryResult.count`, typed `bigint`, and `query()` takes `count: true`. All three use the `count` projection of `arkiv_query`
- Schemas and columns are recognised by a `Symbol.for` brand rather than `instanceof`, so one defined through the package's CJS build is accepted by its ESM build and vice versa

### Changed
- **Breaking:** `@arkiv-network/sdk/attr` is now `@arkiv-network/sdk/schema`
- **Breaking:** `createEntity(schema, values, { expiration, flags?, salt? })` takes the schema the entity is written through, its values keyed by column, and its options. Values are checked against the schema at compile time and at runtime, each column is written with the indexed flag the schema declares, and defaults are applied by the SDK. The options (`expiration`, `flags`, `salt`) are typed `CreateEntityOptions`
- **Breaking:** `patchEntity(schema, entityKey, { set?, unset? })` takes the schema the changes are typed by. `unset` accepts only optional columns, and a column `set` to `undefined` is left out, as on create. Writing a column whose indexing the schema has changed changes it on the entity too. The changes are typed `PatchEntityChanges`
- **Breaking:** `CreateEntityParameters` and `PatchEntityParameters` are now the batch-item shapes `{ schema, values, expiration, ... }` and `{ schema, entityKey, set?, unset? }`
- **Breaking:** `executeBatch()` takes `creates: [{ schema, values, expiration, ... }]` and `patches: [{ schema, entityKey, set?, unset? }]`
- **Breaking:** `expires` is now `expiration` on `createEntity()`, `extendEntity()` and every batch operation
- **Breaking:** `$attributeSchema` entries are `{ type, indexed }` rather than a bare type tag. `indexed` is `undefined` when the node does not report it
- `gt`/`gte`/`lt`/`lte` accept every indexable type, system attributes included, and compare in index order: numerically for `i32`, `u64`, `u256` and `dec`, `false < true` for `bool`, and by unsigned bytes for `str`, `addr`, `key` and `bytes32`. They no longer throw `UnsupportedOperatorError`, which only `startsWith()` throws now. A predicate on a `bytes` value throws `InvalidPredicateError`
- **Breaking:** the page size is capped at 100, the node's new maximum. `MAX_LIMIT` is `100`, and a larger `limit` throws
- **Breaking:** `between` is a reserved attribute name, since the query language now has a `BETWEEN` operator
- `getEntity()` reads with `arkiv_getEntity` instead of an `arkiv_query` on `$key`
- **Breaking:** `select()` / `select("*")` without a schema, and `getEntity(key)`, no longer return `$attributeSchema`: a `FullEntity` is every entity field and `$attributes`. Select `$attributeSchema` by name to read an entity's shape
- **Breaking:** `SelectQueryBuilder`'s type parameters are now the selection and the schema, not the result type. `from()` returns a new builder rather than re-typing the one it was called on
- **Breaking:** `select()` returns flat rows, with or without a schema: the selection names entity fields and attributes side by side, so `select({ $key: true, title: true })` returns `{ $key, title }`, with `title` an `ArkivValue | undefined` without a schema. Rows are plain objects rather than `Entity` instances
- **Breaking:** entity fields are selected and read with a `$` prefix, as `where` already filters on them: `$key`, `$owner`, `$creator`, `$createdAt`, `$updatedAt`, `$expiresAt` and `$creationFlags`. An attribute name cannot start with `$`, so no attribute collides with them, and an attribute named `owner` is selected as `owner`. `$attributes` (every attribute as a map) and `$attributeSchema` replace `attributes` and `attributeSchema`, with or without a schema. `$attributes` takes only `true`: the map of names for a subset is gone, since attributes are selected by name. A `$` name that is not an entity field is a compile error and throws
- **Breaking:** `query()` takes the same selection as `select()` and returns the same flat rows, typed from the selection, instead of `Entity` objects. `QueryOptions` and `QueryReturnType` take the selection and row type as type parameters
- **Breaking:** a selection only known at runtime — typed `SelectArg`, or with a field typed `boolean` — types its results with every field optional (`PartialRow`) instead of claiming every field is present. A field set to `undefined` is not selected, and a selection that asks for nothing (`{}`, or every field `false`) is a compile error
- **Breaking:** the `QueryResult` constructor takes the page's `skipped` count and the query's `count` after `cursor`, before the next-page callback. `QueryResult` takes the type of `count` as a second type parameter
- `ArkivValue` includes `BytesValue`, and `AnyArkivValue` is gone. `UserTypeTag` is now `IndexableTypeTag`
- `MAX_ATTRIBUTES` also caps the number of columns a schema may declare

### Removed
- **Breaking:** the entity payload and content type: `payload`/`contentType` on writes, on `Entity` and in the selection, along with `Entity.toText()`/`toJson()`, `jsonToPayload()`, `stringToPayload()`, `MimeType`, `InvalidContentTypeError` and `MAX_PAYLOAD_BYTES`. Use `bytes` and `str` columns instead
- **Breaking:** `AttributeInputs`, and writing attributes without a schema. A schema built at runtime with `defineSchema` covers dynamic attribute sets
- **Breaking:** the `EntitySelection` and `ProjectedEntity` types. Use `Selection` and `Row`
- **Breaking:** `resolveExpiry()`, `toBlocks()`, `encodeCreationFlags()`, `decodeCreationFlags()` and `OperationType`, and the `EncodedExpiry`, `ExpiryContext` and `ResolvedExpiry` types, are no longer exported. They are internal to the SDK
- **Breaking:** `getEntityCount()` on the public client, and with it `arkiv_getEntityCount`. Count a query instead: `client.count().ownedBy(owner).fetch()`
- The `brotli-wasm` dependency, which nothing in the SDK used

### Fixed
- An exclusion in `DEBUG` (`arkiv:*,-arkiv:query:*`) now silences the namespaces it names. It used to do the opposite: it left those enabled and silenced everything else

## [0.8.1] - 2026-09-08

### Fixed
- Added missing type exports to package root to prevent issues with TypeScript not being able to infer types when using the SDK in a project that has `declaration` enabled.  

## [0.8.0] - 2026-09-07

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
