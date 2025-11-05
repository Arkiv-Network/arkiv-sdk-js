import { createPublicClient, http } from "@arkiv-network/sdk"
import { kaolin } from "@arkiv-network/sdk/chains"

const client = createPublicClient({
  chain: kaolin,
  transport: http(),
})

const entity = await client.getBlockTiming()
console.log(entity)
