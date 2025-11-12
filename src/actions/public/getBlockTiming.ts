import type { ArkivClient } from "../../clients/baseClient"
import { getLogger } from "../../utils/logger"

const logger = getLogger("actions:public:get-block-timing")

export type GetBlockTimingReturnType = {
  currentBlock: bigint
  currentBlockTime: number
  blockDuration: number
}

export async function getBlockTiming(client: ArkivClient) {
  const blockTiming = await client.request({
    method: "arkiv_getBlockTiming",
    params: [],
  })
  logger("Block timing %o", blockTiming)
  return {
    currentBlock: blockTiming.current_block,
    currentBlockTime: blockTiming.current_block_time,
    blockDuration: blockTiming.duration,
  }
}
