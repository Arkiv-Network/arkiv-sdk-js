import { defineChain } from "viem";

export const braga = defineChain({
  id: 60138453102,
  name: "Braga",
  network: "braga",
  nativeCurrency: {
    name: "Golem",
    symbol: "GLM",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://braga.hoodi.arkiv.network/rpc"],
      webSocket: ["wss://braga.hoodi.arkiv.network/rpc/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Braga Arkiv Explorer",
      url: "https://explorer.braga.hoodi.arkiv.network",
      apiUrl: "https://explorer.braga.hoodi.arkiv.network/api",
    },
  },
  testnet: true,
});
