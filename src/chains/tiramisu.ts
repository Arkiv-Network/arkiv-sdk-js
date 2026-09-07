import { defineChain } from "viem"

/**
 * Tiramisu is Arkiv's testnet.
 */
export const tiramisu = defineChain({
  id: 7738577,
  name: "Tiramisu",
  network: "tiramisu",
  nativeCurrency: {
    name: "Golem",
    symbol: "GLM",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.tiramisu.db-chain.testnet.arkiv.network"],
      webSocket: ["wss://rpc.tiramisu.db-chain.testnet.arkiv.network"],
    },
  },
  testnet: true,
})
