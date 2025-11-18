import type { Chain } from "viem"
import * as chains from "../chains"

// Create a lookup map from all exported chains
const chainMap = new Map(Object.entries(chains).map(([key, value]) => [key.toLowerCase(), value]))

/**
 * Get a chain from its name
 * @param name - The name of the chain, case insensitive
 * @returns The chain
 * @throws An error if the chain is not found
 */
export function chainFromName(name: string): Chain {
  const chain = chainMap.get(name.toLowerCase())
  if (!chain) {
    throw new Error(`Unknown chain: ${name}`)
  }
  return chain as Chain
}
