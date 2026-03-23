# SDK Architecture and Capabilities

This repository ships two complementary forms of documentation:

- generated API reference in [`docs/`](./docs)
- this architecture guide, which explains the SDK's internal structure, end-to-end flows, and notable private/file-local helpers that are not always visible in API-only output

## Published entry points

The package exports a main entry point plus focused subpaths from [`package.json`](./package.json):

- `@arkiv-network/sdk` → [`src/index.ts`](./src/index.ts)
  - re-exports viem
  - exports `createPublicClient`, `createWalletClient`, Arkiv error classes, Arkiv types, and selected utilities
- `@arkiv-network/sdk/accounts` → [`src/accounts/index.ts`](./src/accounts/index.ts)
  - re-exports viem account utilities
- `@arkiv-network/sdk/chains` → [`src/chains/index.ts`](./src/chains/index.ts)
  - exports Arkiv chain definitions such as `kaolin`, `mendoza`, `rosario`, `marketplace`, and `localhost`
- `@arkiv-network/sdk/query` → [`src/query/index.ts`](./src/query/index.ts)
  - exports `QueryBuilder`, `QueryResult`, predicate factories (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`), and sort helpers (`asc`, `desc`)
- `@arkiv-network/sdk/types` → [`src/types/index.ts`](./src/types/index.ts)
  - exports public entity, event, RPC, transaction, and query-related types
- `@arkiv-network/sdk/utils` → [`src/utils/index.ts`](./src/utils/index.ts)
  - exports `ExpirationTime`, payload helpers, and viem utility re-exports

## High-level architecture

The SDK is organized into a few layers:

### Client factories

- [`src/clients/createPublicClient.ts`](./src/clients/createPublicClient.ts)
  - creates a viem client extended with Arkiv public actions
- [`src/clients/createWalletClient.ts`](./src/clients/createWalletClient.ts)
  - creates a viem client extended with Arkiv public and wallet actions
- [`src/clients/baseClient.ts`](./src/clients/baseClient.ts)
  - defines the shared `ArkivClient` type
- [`src/clients/decorators/arkivPublic.ts`](./src/clients/decorators/arkivPublic.ts)
  - defines and wires public Arkiv methods such as `getEntity`, `query`, `buildQuery`, `getEntityCount`, `getBlockTiming`, and `subscribeEntityEvents`
- [`src/clients/decorators/arkivWallet.ts`](./src/clients/decorators/arkivWallet.ts)
  - defines and wires wallet mutations such as `createEntity`, `updateEntity`, `deleteEntity`, `extendEntity`, `changeOwnership`, and `mutateEntities`

### Public actions

The public action layer translates high-level reads into Arkiv JSON-RPC requests:

- [`src/actions/public/getEntity.ts`](./src/actions/public/getEntity.ts) fetches a single entity
- [`src/actions/public/query.ts`](./src/actions/public/query.ts) executes raw query strings
- [`src/actions/public/buildQuery.ts`](./src/actions/public/buildQuery.ts) exposes fluent query construction
- [`src/actions/public/getEntityCount.ts`](./src/actions/public/getEntityCount.ts) retrieves DBChain entity count
- [`src/actions/public/getBlockTiming.ts`](./src/actions/public/getBlockTiming.ts) retrieves current block timing data
- [`src/actions/public/subscribeEntityEvents.ts`](./src/actions/public/subscribeEntityEvents.ts) watches Arkiv entity lifecycle events

### Wallet actions

Wallet actions package entity mutations into Arkiv transaction payloads and send them through viem:

- [`src/actions/wallet/createEntity.ts`](./src/actions/wallet/createEntity.ts)
- [`src/actions/wallet/updateEntity.ts`](./src/actions/wallet/updateEntity.ts)
- [`src/actions/wallet/deleteEntity.ts`](./src/actions/wallet/deleteEntity.ts)
- [`src/actions/wallet/extendEntity.ts`](./src/actions/wallet/extendEntity.ts)
- [`src/actions/wallet/changeOwnership.ts`](./src/actions/wallet/changeOwnership.ts)
- [`src/actions/wallet/mutateEntities.ts`](./src/actions/wallet/mutateEntities.ts)

### Query engine

The query subsystem is split into a fluent builder, predicate factories, and a low-level serializer:

- [`src/query/queryBuilder.ts`](./src/query/queryBuilder.ts)
  - main fluent builder used by consumers
- [`src/query/predicate.ts`](./src/query/predicate.ts)
  - predicate types and factories
- [`src/query/engine.ts`](./src/query/engine.ts)
  - serializes builder state into the `arkiv_query` wire format
- [`src/query/queryResult.ts`](./src/query/queryResult.ts)
  - wraps paginated query results and continuation logic

### Utility layer

Shared helpers support encoding, decoding, logging, compression, and chain utilities:

- [`src/utils/arkivTransactions.ts`](./src/utils/arkivTransactions.ts)
- [`src/utils/compression.ts`](./src/utils/compression.ts)
- [`src/utils/entities.ts`](./src/utils/entities.ts)
- [`src/utils/expirationTime.ts`](./src/utils/expirationTime.ts)
- [`src/utils/payload.ts`](./src/utils/payload.ts)
- [`src/utils/chains.ts`](./src/utils/chains.ts)
- [`src/utils/logger.ts`](./src/utils/logger.ts)

### Types and models

- [`src/types/entity.ts`](./src/types/entity.ts) defines the `Entity` model and payload decoding helpers
- [`src/types/attributes.ts`](./src/types/attributes.ts) defines entity attributes
- [`src/types/events.ts`](./src/types/events.ts) defines subscription event payloads
- [`src/types/rpcSchema.ts`](./src/types/rpcSchema.ts) defines Arkiv RPC request/response shapes
- [`src/types/txParams.ts`](./src/types/txParams.ts) defines optional transaction parameters
- [`src/types/mimeTypes.ts`](./src/types/mimeTypes.ts) defines MIME-related types

## Capabilities exposed by the SDK

### Read/query capabilities

The public client can:

- fetch a single entity by key via `getEntity`
- run raw Arkiv query strings via `query`
- build strongly-typed fluent queries with owner/creator filters, ordering, pagination, historical block views, and include-data switches via `QueryBuilder`
- retrieve total entity count via `getEntityCount`
- retrieve current Arkiv block timing via `getBlockTiming`
- subscribe to create, update, delete, expiry, and ownership-related entity events via `subscribeEntityEvents`

### Write/mutation capabilities

The wallet client can:

- create entities
- update entities
- delete entities
- extend expiration
- change ownership
- batch the above operations together with `mutateEntities`

All mutations ultimately target the Arkiv contract address and encode operations through the helpers in [`src/utils/arkivTransactions.ts`](./src/utils/arkivTransactions.ts).

## Notable internal and private implementation details

### Private `QueryBuilder` state

[`src/query/queryBuilder.ts`](./src/query/queryBuilder.ts) stores the builder state in private fields:

- `_client`
- `_ownedBy`
- `_createdBy`
- `_orderBy`
- `_validAtBlock`
- `_withAttributes`
- `_withMetadata`
- `_withPayload`
- `_limit`
- `_cursor`
- `_predicates`

These fields are the complete in-memory representation of a fluent query before it is serialized by `processQuery`.

### Private `QueryResult` state

[`src/query/queryResult.ts`](./src/query/queryResult.ts) stores pagination state in private fields:

- `_endOfIteration`
- `_cursor`
- `_limit`
- `_validAtBlock`
- `_queryBuilder`

This lets `next()`, `previous()`, `hasNextPage()`, and related helpers continue the same logical query across pages.

### File-local internal helpers

Some of the most important internal functions are intentionally file-local and are worth understanding when working on the SDK:

- [`src/query/engine.ts`](./src/query/engine.ts)
  - `processPredicates(predicates)` recursively converts predicate trees into Arkiv query syntax, handling nested `and`/`or` groups and scalar comparisons before `processQuery` adds `$owner` and `$creator` filters
- [`src/utils/arkivTransactions.ts`](./src/utils/arkivTransactions.ts)
  - `formatAttributes(attribute)` converts individual attributes into `[key, value]` hex tuples for RLP encoding
  - `opsToTxData(...)` groups creates, updates, deletes, extensions, and ownership changes into the nested payload expected by Arkiv transactions
- [`src/actions/wallet/mutateEntities.ts`](./src/actions/wallet/mutateEntities.ts)
  - `parseReceipt(receipt, params)` maps emitted logs back to created, updated, deleted, extended, and ownership-changed entity keys
- [`src/utils/logger.ts`](./src/utils/logger.ts)
  - `getDebugEnv()` reads `DEBUG` from Node or browser-compatible storage
  - `matchesPattern(namespace, pattern)` handles wildcard and negative debug namespace matching
  - `isEnabled(namespace)` merges environment-based and programmatic debug configuration
  - `getColorForNamespace(namespace)` produces stable namespace colors for log output
  - `createDebugLogger(namespace)` builds the actual logging closure returned by `getLogger`
- [`src/utils/entities.ts`](./src/utils/entities.ts)
  - `entityFromRpcResult(rpcEntity)` converts raw Arkiv RPC payloads into the SDK `Entity` model

## End-to-end flow: fluent query execution

1. A consumer calls `client.buildQuery()` from [`src/clients/decorators/arkivPublic.ts`](./src/clients/decorators/arkivPublic.ts).
2. [`src/query/queryBuilder.ts`](./src/query/queryBuilder.ts) collects fluent state in its private fields.
3. `fetch()` or `count()` forwards the accumulated state to `processQuery` in [`src/query/engine.ts`](./src/query/engine.ts).
4. `processPredicates()` turns predicate trees into Arkiv query syntax.
5. `processQuery()` adds owner/creator filters, builds `RpcQueryOptions`, and sends `arkiv_query`.
6. [`src/utils/entities.ts`](./src/utils/entities.ts) maps raw RPC entities into `Entity` instances.
7. [`src/query/queryResult.ts`](./src/query/queryResult.ts) preserves cursor and block context for pagination helpers.

## End-to-end flow: wallet mutations

1. A consumer calls a wallet action such as `createEntity` or `mutateEntities`.
2. The action transforms high-level parameters into low-level transaction payload data with `opsToTxData` in [`src/utils/arkivTransactions.ts`](./src/utils/arkivTransactions.ts).
3. Expiration values are converted from seconds into Arkiv block counts using constants in [`src/consts.ts`](./src/consts.ts).
4. `sendArkivTransaction` compresses the payload, submits the transaction, waits for the receipt, and surfaces Arkiv-specific mutation errors.
5. Individual wallet actions or `parseReceipt` extract the affected entity keys from emitted logs.

## Logging and diagnostics

[`src/utils/logger.ts`](./src/utils/logger.ts) provides the SDK's debug logging implementation:

- root namespace: `arkiv`
- scoped loggers: `getLogger("query:engine")` becomes `arkiv:query:engine`
- environment control: `DEBUG=arkiv:*`
- programmatic control: `enableDebug(...)` and `disableDebug()`
- output works in both Node.js and browser-like environments

## Generated API docs

Generated API reference is produced by [`typedoc.json`](./typedoc.json) into [`docs/`](./docs). The configuration is intentionally broad so the generated reference covers:

- published entry points
- internal implementation modules under `src/`
- private and protected members
- symbols tagged as internal

Test files are excluded from generated docs.
