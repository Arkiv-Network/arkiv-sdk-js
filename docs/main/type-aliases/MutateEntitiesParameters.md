[**@arkiv-network/sdk v0.5.3**](../../index.md)

***

[@arkiv-network/sdk](../../index.md) / [main](../index.md) / MutateEntitiesParameters

# Type Alias: MutateEntitiesParameters

> **MutateEntitiesParameters** = `object`

Defined in: [src/actions/wallet/mutateEntities.ts:22](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/actions/wallet/mutateEntities.ts#L22)

Parameters for the mutateEntities function.
- creates: The creates to perform.
- updates: The updates to perform.
- deletes: The deletes to perform.
- extensions: The extensions to perform.

## Properties

### creates?

> `optional` **creates**: [`CreateEntityParameters`](CreateEntityParameters.md)[]

Defined in: [src/actions/wallet/mutateEntities.ts:23](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/actions/wallet/mutateEntities.ts#L23)

***

### deletes?

> `optional` **deletes**: [`DeleteEntityParameters`](DeleteEntityParameters.md)[]

Defined in: [src/actions/wallet/mutateEntities.ts:25](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/actions/wallet/mutateEntities.ts#L25)

***

### extensions?

> `optional` **extensions**: [`ExtendEntityParameters`](ExtendEntityParameters.md)[]

Defined in: [src/actions/wallet/mutateEntities.ts:26](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/actions/wallet/mutateEntities.ts#L26)

***

### ownershipChanges?

> `optional` **ownershipChanges**: [`ChangeOwnershipParameters`](ChangeOwnershipParameters.md)[]

Defined in: [src/actions/wallet/mutateEntities.ts:27](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/actions/wallet/mutateEntities.ts#L27)

***

### updates?

> `optional` **updates**: [`UpdateEntityParameters`](UpdateEntityParameters.md)[]

Defined in: [src/actions/wallet/mutateEntities.ts:24](https://github.com/Arkiv-Network/arkiv-sdk-js/blob/552cd007ec5882e7eec951314066bdc142f5a49a/src/actions/wallet/mutateEntities.ts#L24)
