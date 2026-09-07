import type {
  Account,
  Address,
  Chain,
  Client,
  ParseAccount,
  Prettify,
  PublicClientConfig,
  RpcSchema,
  Transport,
} from "viem"
import { createClient, publicActions } from "viem"
import type { ArkivRpcSchema } from "../types/rpcSchema"
import { type PublicArkivActions, publicArkivActions } from "./decorators/arkivPublic"

export type PublicArkivClient<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  accountOrAddress extends Account | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = ArkivRpcSchema,
> = Prettify<
  Client<transport, chain, accountOrAddress, rpcSchema, PublicArkivActions<transport, chain>>
>

/**
 * Creates a Public Client with a given [Transport](https://viem.sh/docs/clients/intro) configured for a [Chain](https://viem.sh/docs/chains/introduction).
 *
 * A Public Client is an interface to the "public" [Ethereum JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/)
 * and the Arkiv JSON-RPC API — retrieving block numbers and transactions, reading from
 * contracts, and querying entities — through {@link PublicArkivActions}.
 *
 * @param parameters - Configuration object for the public client (chain, transport, etc.)
 * @returns An Arkiv Public Client. {@link PublicArkivClient}
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { tiramisu } from "@arkiv-network/sdk/chains"
 * import { http } from "viem"
 *
 * const client = createPublicClient({
 *   chain: tiramisu,
 *   transport: http(),
 * })
 */
export function createPublicClient<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = ArkivRpcSchema,
>(
  parameters: PublicClientConfig<transport, chain, accountOrAddress, rpcSchema>,
): PublicArkivClient<transport, chain, ParseAccount<accountOrAddress>, rpcSchema> {
  const { key = "public", name = "Public Client" } = parameters
  const client = createClient({
    ...parameters,
    key,
    name,
  })

  return client.extend(publicActions).extend(publicArkivActions) as unknown as PublicArkivClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >
}
