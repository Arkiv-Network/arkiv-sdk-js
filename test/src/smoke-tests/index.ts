import { createPublicClient } from "@arkiv-network/sdk"
import { braga } from "@arkiv-network/sdk/chains"
import { http } from "viem"

const client = createPublicClient({
  chain: braga,
  transport: http(),
})

const entity = await client.getBlockTiming()
console.log(entity)
