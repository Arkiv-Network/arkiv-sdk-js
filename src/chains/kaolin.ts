import { defineChain } from "viem";

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
			http: ["https://kaolin.holesky.golemdb.io/rpc"],
			webSocket: ["wss://kaolin.holesky.golemdb.io/rpc/ws"],
		},
	},
	blockExplorers: {
		default: {
			name: "Acala Blockscout",
			url: "https://explorer.kaolin.holesky.golemdb.io/",
			apiUrl: "https://explorer.kaolin.holesky.golemdb.io/api",
		},
	},
	testnet: true,
});
