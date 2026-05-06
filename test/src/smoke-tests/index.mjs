import { createPublicClient, http } from "@arkiv-network/sdk"
import { braga } from "@arkiv-network/sdk/chains"

const client = createPublicClient({
  chain: braga,
  transport: http(),
})

const entity = await client.getBlockTiming()
console.log(entity)
