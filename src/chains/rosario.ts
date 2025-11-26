import { defineChain } from "viem"

export const rosario = defineChain({
  id: 60138453057,
  name: "Rosario",
  network: "rosario",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rosario.hoodi.arkiv.network/rpc"],
      webSocket: ["wss://rosario.hoodi.arkiv.network/rpc/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Rosario Arkiv Explorer",
      url: "https://explorer.rosario.hoodi.arkiv.network",
      apiUrl: "https://explorer.rosario.hoodi.arkiv.network/api",
    },
  },
  testnet: true,
})
