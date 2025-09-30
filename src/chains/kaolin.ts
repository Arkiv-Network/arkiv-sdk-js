import { defineChain } from "viem"

export const kaolin = defineChain({
	id: 60138453025,
	name: "Kaolin",
	network: "kaolin",
	nativeCurrency: {
		name: "Ethereum",
		symbol: "ETH",
		decimals: 18,
	},
	rpcUrls: {
		default: {
			http: ["https://kaolin.hoodi.arkiv.network/rpc"],
			webSocket: ["wss://kaolin.hoodi.arkiv.network/rpc/ws"],
		},
	},
	blockExplorers: {
		default: {
			name: "Kaolin Arkiv Explorer",
			url: "https://explorer.kaolin.hoodi.arkiv.network",
			apiUrl: "https://explorer.kaolin.hoodi.arkiv.network/api",
		},
	},
	testnet: true,
})
