# API Reference

This file summarizes the public API exposed by `@arkiv-network/sdk`.
For generated reference docs, see the [`docs/`](./docs) directory.

## Package entry points

- `@arkiv-network/sdk` – main client factory functions, shared types, selected utils, and viem re-exports
- `@arkiv-network/sdk/accounts` – account helpers re-exported from `viem/accounts`
- `@arkiv-network/sdk/chains` – Arkiv chain definitions
- `@arkiv-network/sdk/query` – query builder, predicates, and ordering helpers
- `@arkiv-network/sdk/types` – Arkiv-specific TypeScript types
- `@arkiv-network/sdk/utils` – utility helpers such as payload encoding and expiration helpers

## Main exports

### Client factories

- `createPublicClient(config)` – creates a read client for Arkiv RPC and selected viem public actions
- `createWalletClient(config)` – creates a wallet client with Arkiv write actions

### Top-level types and errors

Main exports also include:

- `PublicArkivClient`
- `WalletArkivClient`
- `PublicArkivActions`
- `WalletArkivActions`
- `ArkivClient`
- Arkiv entity, event, RPC schema, transaction, and query types from `@arkiv-network/sdk/types`
- Errors such as `EntityMutationError`, `NoEntityFoundError`, `NoMoreResultsError`, and `NoCursorOrLimitError`

### Top-level utility exports

- `chainFromName(name)`
- `jsonToPayload(value)`
- `stringToPayload(value)`

## Public client API

`createPublicClient()` returns a viem-compatible client extended with Arkiv read actions.

Core Arkiv methods:

- `getEntity(entityKey)`
- `getEntityCount()`
- `getBlockTiming()`
- `query(rawQuery, queryOptions?)`
- `buildQuery()`
- `subscribeEntityEvents(handlers, pollingInterval?, fromBlock?)`

The public client also includes selected viem public actions such as:

- `getBalance()`
- `getBlock()`
- `getBlockNumber()`
- `getChainId()`
- `getLogs()`
- `getTransaction()`
- `getTransactionCount()`
- `getTransactionReceipt()`
- `waitForTransactionReceipt()`
- `watchEvent()`

## Wallet client API

`createWalletClient()` returns a client for Arkiv write operations.

Arkiv wallet methods:

- `createEntity(data, txParams?)`
- `updateEntity(data, txParams?)`
- `deleteEntity(data, txParams?)`
- `extendEntity(data, txParams?)`
- `changeOwnership(data, txParams?)`
- `mutateEntities(data, txParams?)`

The wallet client also exposes selected viem wallet methods such as:

- `addChain()`
- `sendCalls()`
- `waitForCallsStatus()`
- `sendTransaction()`
- `sendRawTransaction()`
- `signMessage()`
- `signTransaction()`
- `waitForTransactionReceipt()`

## Query API

Import query helpers from `@arkiv-network/sdk/query`.

### Query builder

`publicClient.buildQuery()` returns a `QueryBuilder` that supports:

- `where(predicate | predicate[])`
- `ownedBy(address)`
- `createdBy(address)`
- `withAttributes(enabled)`
- `withMetadata(enabled)`
- `withPayload(enabled)`
- `limit(count)`
- `offset(count)`
- `atBlock(blockNumber)`
- `orderBy(orderBy)`
- `fetch()`

### Predicates and ordering

- Comparison helpers: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`
- Logical helpers: `and`, `or`, `not`
- Ordering helpers: `asc`, `desc`

## Utility API

Import utilities from `@arkiv-network/sdk/utils`.

- `jsonToPayload(value)` – encodes a JSON value to a payload byte array
- `stringToPayload(value)` – encodes a string to a payload byte array
- `ExpirationTime` – helper object with `fromSeconds`, `fromMinutes`, `fromHours`, `fromDays`, `fromWeeks`, `fromMonths`, `fromYears`, `fromBlocks`, and `fromDate`

`expiresIn` values accepted by wallet operations are expressed in seconds.

## Chains

Import Arkiv chains from `@arkiv-network/sdk/chains`:

- `kaolin`
- `localhost`
- `marketplace`
- `mendoza`
- `rosario`

## Accounts

Import account helpers from `@arkiv-network/sdk/accounts`.

Common example:

- `privateKeyToAccount(privateKey)`

This subpath is a re-export of `viem/accounts`, so the full viem accounts helper surface is available there.

## Entity helpers

The `Entity` class includes convenience methods:

- `toText()` – decodes the payload as text
- `toJson()` – parses the payload as JSON
