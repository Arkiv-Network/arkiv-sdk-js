import { defineChain } from "viem"

export const mendoza = defineChain({
  id: 60138453056,
  name: "Mendoza",
  network: "mendoza",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://mendoza.hoodi.arkiv.network/rpc"],
      webSocket: ["wss://mendoza.hoodi.arkiv.network/rpc/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mendoza Arkiv Explorer",
      url: "https://explorer.mendoza.hoodi.arkiv.network",
      apiUrl: "https://explorer.mendoza.hoodi.arkiv.network/api",
    },
  },
  testnet: true,
})
