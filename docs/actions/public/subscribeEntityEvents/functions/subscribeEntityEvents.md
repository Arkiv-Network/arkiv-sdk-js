[**@arkiv-network/sdk v0.6.5-dev.10**](../../../../index.md)

***

[@arkiv-network/sdk](../../../../index.md) / [actions/public/subscribeEntityEvents](../index.md) / subscribeEntityEvents

# Function: subscribeEntityEvents()

> **subscribeEntityEvents**(`client`, `__namedParameters`, `pollingInterval?`, `fromBlock?`): `Promise`\<() => `void`\>

Defined in: [src/actions/public/subscribeEntityEvents.ts:25](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/f49ca7fc2b8011c845d4dcdedd55114d03c0304f/src/actions/public/subscribeEntityEvents.ts#L25)

## Parameters

### client

[`ArkivClient`](../../../../clients/baseClient/type-aliases/ArkivClient.md)

### \_\_namedParameters

#### onEntityCreated?

(`event`) => `void`

#### onEntityDeleted?

(`event`) => `void`

#### onEntityExpired?

(`event`) => `void`

#### onEntityExpiresInExtended?

(`event`) => `void`

#### onEntityOwnerChanged?

(`event`) => `void`

#### onEntityUpdated?

(`event`) => `void`

#### onError

((`error`) => `void`) \| `undefined`

### pollingInterval?

`number`

### fromBlock?

`bigint`

## Returns

`Promise`\<() => `void`\>
