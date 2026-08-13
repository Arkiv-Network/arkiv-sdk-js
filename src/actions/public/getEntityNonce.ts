import type { Address } from "viem"
import { readContract } from "viem/actions"
import type { ArkivClient } from "../../clients/baseClient"
import { ARKIV_ADDRESS } from "../../consts"
import { ENTITY_NONCE_ABI } from "../../entity/operations"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:public:get-entity-nonce")

/**
 * Reads an owner's entity-minting nonce — how many entities that account has created.
 *
 * This is not the account's transaction nonce. The engine keeps a separate counter per creator and
 * mixes it into every key it mints, which is what makes two identical creates from one account land
 * on different keys.
 *
 * @param owner - The account whose nonce to read.
 * @returns The number of entities `owner` has created so far, which is the nonce its next create
 * will use.
 */
export async function getEntityNonce(client: ArkivClient, owner: Address): Promise<bigint> {
  const nonce = await readContract(client, {
    address: ARKIV_ADDRESS,
    abi: ENTITY_NONCE_ABI,
    functionName: "entityNonce",
    args: [owner],
  })
  logger("entity nonce of %s is %s", owner, nonce)
  return nonce
}
