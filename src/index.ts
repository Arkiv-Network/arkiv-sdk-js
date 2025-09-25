// Export all public APIs

export type {
	Account,
	Address,
	Chain,
	PublicClientConfig,
	RpcSchema,
	Transport,
} from "viem";
// Re-export commonly used viem types for convenience
export { http, webSocket } from "viem";
export type { ArkivClient } from "./clients/baseClient";
export type { PublicArkivClient } from "./clients/createPublicClient";
export { createPublicClient } from "./clients/createPublicClient";
export type { Annotation } from "./types/annotation";
export type { Entity } from "./types/entity";
export type { ArkivRpcSchema } from "./types/rpcSchema";
