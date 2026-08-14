import { defineChain } from "viem"

/**
 * Cheesecake is Arkiv's testnet.
 */
export const cheesecake = defineChain({
  id: 7733102,
  name: "Cheesecake",
  network: "cheesecake",
  nativeCurrency: {
    name: "Golem",
    symbol: "GLM",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.cheesecake.db-chain.devnet.gobas.me"],
      webSocket: ["wss://rpc.cheesecake.db-chain.devnet.gobas.me"],
    },
  },
  testnet: true,
})
