const { createPublicClient, http } = require("@arkiv-network/sdk")
const { braga } = require("@arkiv-network/sdk/chains")

const client = createPublicClient({
  chain: braga,
  transport: http(),
})

async function main() {
  const entity = await client.getBlockTiming()
  console.log(entity)
}

main()
