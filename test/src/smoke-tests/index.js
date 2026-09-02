import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"

const client = createPublicClient({
  chain: tiramisu,
  transport: http(),
})

const entity = await client.getBlockTiming()
console.log(entity)
