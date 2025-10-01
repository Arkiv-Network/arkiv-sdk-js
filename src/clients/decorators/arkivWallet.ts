import type { Account, Chain, Client, Transport, WalletActions } from "viem"
import {
	type CreateEntityParameters,
	type CreateEntityReturnType,
	createEntity,
} from "../../actions/wallet/createEntity"
import type { Entity, TxParams } from "../../types"
import type { PublicArkivActions } from "./arkivPublic"

export type WalletArkivActions<
	transport extends Transport = Transport,
	chain extends Chain | undefined = Chain | undefined,
	account extends Account | undefined = Account | undefined,
> = PublicArkivActions<transport, chain, account> &
	Pick<WalletActions<chain, account>, "sendTransaction" | "signMessage" | "signTransaction"> & {
		/**
		 * Returns the entity with the given key.
		 *
		 * - Docs: https://docs.golemdb.io/ts-sdk/actions/public/getEntity
		 * - JSON-RPC Methods: [`golembase_getStorageValue`](https://docs.golemdb.io/dev/json-rpc-api/#golembase_getstoragevalue)
		 * - JSON-RPC Methods: [`golembase_getEntityMetaData`](https://docs.golemdb.io/dev/json-rpc-api/#golembase_getEntityMetaData)
		 *
		 * @param args - {entityKey}
		 * @returns The entity with the given key. {@link Entity}
		 *
		 * @example
		 * import { createPublicClient, http } from 'arkiv'
		 * import { kaolin } from 'arkiv/chains'
		 *
		 * const client = createPublicClient({
		 *   chain: kaolin,
		 *   transport: http(),
		 * })
		 * const entity = await client.getEntity("0x123")
		 * // {
		 * //   key: "0x123",
		 * //   value: "0x123",
		 * // }
		 */
		createEntity: (
			data: CreateEntityParameters,
			txParams?: TxParams,
		) => Promise<CreateEntityReturnType>
	}

export function walletArkivActions<
	transport extends Transport = Transport,
	chain extends Chain | undefined = Chain | undefined,
	account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
	return {
		createEntity: (data: CreateEntityParameters, txParams?: TxParams) =>
			createEntity(client, data, txParams),
	}
}
