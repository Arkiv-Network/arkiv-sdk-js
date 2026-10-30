import { defineChain } from "viem"
import { ACCESS_KEYS_URL } from "../consts"
import { MissingAccessKeyError } from "../errors"

const RPC_HOST = "rpc.rabdi.db-chain.testnet.arkiv.network"

let warnedPublicEndpoint = false

export type ArkivChainOptions = {
  /**
   * An Arkiv RPC access key, sent as the last segment of the RPC URLs' path. It is not a secret, as
   * it ships with any app that talks to the chain, but restrict it to your origins or IPs. Get a
   * free one at https://hub.arkiv.network/access-keys.
   *
   * `""` uses the public endpoint, which is heavily rate limited.
   */
  accessKey: string
}

/**
 * Rabdi is Arkiv's testnet. The chain carries the access key in its RPC URLs, so every transport
 * that defaults to the chain's URL (`http()`, `webSocket()`, wagmi's transports) and every wallet
 * the chain is added to sends it.
 *
 * @throws {MissingAccessKeyError} When the key is missing. Pass `""` to go without one
 *
 * @example
 * import { createPublicClient } from "@arkiv-network/sdk"
 * import { rabdi } from "@arkiv-network/sdk/chains"
 * import { http } from "viem"
 *
 * const client = createPublicClient({
 *   chain: rabdi({ accessKey: "..." }),
 *   transport: http(),
 * })
 */
export function rabdi(options: ArkivChainOptions) {
  if (typeof options?.accessKey !== "string") throw new MissingAccessKeyError("Rabdi")
  if (options.accessKey === "" && !warnedPublicEndpoint) {
    warnedPublicEndpoint = true
    console.warn(
      "Rabdi: no access key, so requests go to the public endpoint, which is heavily rate " +
        `limited. Get a free key at ${ACCESS_KEYS_URL} and pass it as rabdi({ accessKey }).`,
    )
  }
  const path = options.accessKey === "" ? "" : `/${encodeURIComponent(options.accessKey)}`

  return defineChain({
    id: 7794095,
    name: "Rabdi",
    network: "rabdi",
    nativeCurrency: {
      name: "Golem",
      symbol: "tGLM",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [`https://${RPC_HOST}${path}`],
        webSocket: [`wss://${RPC_HOST}${path}`],
      },
    },
    blockExplorers: {
      default: {
        name: "Rabdi Explorer",
        url: "https://rabdi.explorer.arkiv.network",
      },
    },
    testnet: true,
  })
}
