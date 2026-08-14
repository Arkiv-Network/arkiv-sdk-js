import { createPublicClient } from "@arkiv-network/sdk"
import { cheesecake } from "@arkiv-network/sdk/chains"
import { http } from "viem"

const client = createPublicClient({
  chain: cheesecake,
  transport: http(),
})

const entity = await client.getBlockTiming()
console.log(entity)
