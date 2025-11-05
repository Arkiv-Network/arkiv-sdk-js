const { createPublicClient, http } = require("@arkiv-network/sdk")
const { kaolin } = require("@arkiv-network/sdk/chains")

const client = createPublicClient({
  chain: kaolin,
  transport: http(),
})

async function main() {
  const entity = await client.getBlockTiming()
  console.log(entity)
}

main()
