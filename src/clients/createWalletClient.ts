import type {
  Account,
  Address,
  Chain,
  Client,
  ParseAccount,
  Prettify,
  RpcSchema,
  Transport,
  WalletClientConfig,
} from "viem"
import { createClient, publicActions, walletActions } from "viem"
import type { ArkivRpcSchema } from "../types/rpcSchema"
import { type WalletArkivActions, walletArkivActions } from "./decorators/arkivWallet"

export type WalletArkivClient<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
  rpcSchema extends RpcSchema | undefined = ArkivRpcSchema,
> = Prettify<
  Client<transport, chain, account, rpcSchema, WalletArkivActions<transport, chain, account>>
>

/**
 * Creates a Wallet Client with a given [Transport](https://viem.sh/docs/clients/intro) configured for a [Chain](https://viem.sh/docs/clients/chains).
 *
 * - Docs: https://docs.arkiv.network/ts-sdk/clients/wallet
 *
 * A Wallet Client extends the base client with Arkiv wallet actions for creating, updating, deleting, extending, and transferring ownership of entities.
 *
 * @param parameters - Configuration object for the wallet client (chain, transport, account, etc.)
 * @returns A Arkiv Wallet Client. {@link WalletArkivClient}
 *
 * @example
 * import { createWalletClient, http } from '@arkiv-network/sdk'
 * import { privateKeyToAccount } from '@arkiv-network/sdk/accounts'
 * import { kaolin } from '@arkiv-network/sdk/chains'
 *
 * const client = createWalletClient({
 *   chain: kaolin,
 *   transport: http(),
 *   account: privateKeyToAccount('0x...'),
 * })
 */
export function createWalletClient<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = ArkivRpcSchema,
>(
  parameters: WalletClientConfig<transport, chain, accountOrAddress, rpcSchema>,
): WalletArkivClient<transport, chain, ParseAccount<accountOrAddress>, rpcSchema> {
  const { key = "wallet", name = "Wallet Client" } = parameters
  const client = createClient({
    ...parameters,
    key,
    name,
  })

  return client
    .extend(publicActions)
    .extend(walletActions)
    .extend(walletArkivActions) as unknown as WalletArkivClient<
    transport,
    chain,
    ParseAccount<accountOrAddress>,
    rpcSchema
  >
}
