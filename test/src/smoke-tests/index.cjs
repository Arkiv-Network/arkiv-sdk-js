const { createPublicClient } = require("@arkiv-network/sdk")
const { rabdi } = require("@arkiv-network/sdk/chains")
const { http } = require("viem")

const client = createPublicClient({
  chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }),
  transport: http(),
})

async function main() {
  const entity = await client.getBlockTiming()
  console.log(entity)
}

main()
