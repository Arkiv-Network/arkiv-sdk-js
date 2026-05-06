import type { Hex } from "@arkiv-network/sdk"
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers"

export async function launchLocalArkivNode(withFundingAddress: Hex | undefined = undefined) {
  const container = await new GenericContainer("ghcr.io/arkiv-network/arkiv-node-dev:latest")
    .withExposedPorts(8545)
    .withExposedPorts(8546)
    .withWaitStrategy(Wait.forLogMessage("Block added to canonical chain", 1))
    .withStartupTimeout(30000)
    .start()

  const httpPort = container.getMappedPort(8545)
  const wsPort = container.getMappedPort(8546)
  
  if (withFundingAddress) {
    await execCommand(container, [
      "fund-account.sh",
      "--address",
      withFundingAddress,
      "--value",
      "1.0E18" //1 ETH = 1e18 wei
    ])
  }

  return { container, httpPort, wsPort }
}

export async function execCommand(container: StartedTestContainer, command: string[]) {
  console.debug("Executing command", command)
  const stdout = await new Response(
    Bun.spawn(["docker", "exec", container.getId(), ...command]).stdout,
  ).text()
  console.debug("Command output", stdout)
  return stdout
}
