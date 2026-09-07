import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers"
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  parseEther,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

// First account of the standard test mnemonic, pre-funded by the node in --dev mode.
const DEV_FUNDED_PRIVATE_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

export async function launchLocalArkivNode(withFundingAddress: Hex | undefined = undefined) {
  const container = await new GenericContainer("ghcr.io/arkiv-network/arkiv-reth-dev:latest")
    .withExposedPorts(8545)
    .withExposedPorts(8546)
    .withWaitStrategy(Wait.forLogMessage("Block added to canonical chain", 1))
    .withStartupTimeout(30000)
    .start()

  const httpPort = container.getMappedPort(8545)
  const wsPort = container.getMappedPort(8546)

  if (withFundingAddress) {
    await fundAccount(httpPort, withFundingAddress)
  }

  return { container, httpPort, wsPort }
}

async function fundAccount(httpPort: number, address: Hex) {
  const url = `http://127.0.0.1:${httpPort}`
  const publicClient = createPublicClient({ transport: http(url) })
  const chain = defineChain({
    id: await publicClient.getChainId(),
    name: "Arkiv Local Dev",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  })
  const devAccount = createWalletClient({
    transport: http(url),
    chain,
    account: privateKeyToAccount(DEV_FUNDED_PRIVATE_KEY),
  })
  const hash = await devAccount.sendTransaction({ to: address, value: parseEther("1") })
  await publicClient.waitForTransactionReceipt({ hash })
}

export async function execCommand(container: StartedTestContainer, command: string[]) {
  console.debug("Executing command", command)
  const stdout = await new Response(
    Bun.spawn(["docker", "exec", container.getId(), ...command]).stdout,
  ).text()
  console.debug("Command output", stdout)
  return stdout
}
