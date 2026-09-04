/**
 * The advanced path: send, ping and read results as separate, single-RPC-call steps.
 *
 * The everyday actions (`createEntity`, `executeBatch`, …) bundle send + wait + decode into one
 * call, which is convenient and spends several RPC requests. These actions unbundle that so a
 * caller can hit the theoretical minimum:
 *
 * 1. {@link buildMutation} — encode locally (0 RPC calls with `currentBlock` supplied)
 * 2. {@link sendMutation} — submit and return the hash (1 call with full `txParams`)
 * 3. {@link pingTransaction} — one `eth_getTransactionReceipt`, on your schedule
 * 4. {@link getMutationResult} / {@link decodeMutationResult} — the same single call (or none)
 *    turned into entity keys and expiries
 */
export type { BuildMutationOptions, BuildMutationReturnType } from "./buildMutation"
export { buildMutation } from "./buildMutation"
export type { GetMutationResultReturnType, MutationResult } from "./getMutationResult"
export { decodeMutationResult, getMutationResult } from "./getMutationResult"
export type { PingTransactionReturnType } from "./pingTransaction"
export { pingTransaction } from "./pingTransaction"
export type { SendMutationOptions, SendMutationReturnType } from "./sendMutation"
export { sendMutation } from "./sendMutation"
