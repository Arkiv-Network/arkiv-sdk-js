import type { Account, Chain, Client, PublicActions, Transport } from "viem";
import { getEntityByKey } from "../../actions/public/getEntityByKey";
import type { Entity } from "../../types/entity";

export type PublicArkivActions<
	transport extends Transport = Transport,
	chain extends Chain | undefined = Chain | undefined,
	account extends Account | undefined = Account | undefined,
> = Pick<
	PublicActions<transport, chain, account>,
	| "getBalance"
	| "getBlock"
	| "getBlockNumber"
	| "getChainId"
	| "getLogs"
	| "getTransaction"
	| "getTransactionCount"
	| "getTransactionReceipt"
> & {
	/**
	 * Returns the entity with the given key.
	 *
	 * - Docs: https://docs.golemdb.io/ts-sdk/actions/public/getEntityByKey
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
	 * const entity = await client.getEntityByKey("0x123")
	 * // {
	 * //   key: "0x123",
	 * //   value: "0x123",
	 * // }
	 */
	getEntityByKey: (key: string) => Promise<Entity>;
};

export function publicArkivActions<
	transport extends Transport = Transport,
	chain extends Chain | undefined = Chain | undefined,
	account extends Account | undefined = Account | undefined,
>(client: Client<transport, chain, account>) {
	return {
		getEntityByKey: (key: string) => getEntityByKey(client, key),
	};
}
