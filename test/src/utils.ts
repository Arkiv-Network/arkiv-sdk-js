import type { Hex } from "@arkiv-network/sdk"
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers"

type ArkivTestRpcUrlOptions = {
  httpPort?: number
  wsPort?: number
  rpcUrl?: string
  wsUrl?: string
}

export async function launchLocalArkivNode(withFundingAccount: Hex | undefined = undefined) {
  const container = await new GenericContainer("golemnetwork/arkiv-op-geth:latest")
    .withExposedPorts(8545)
    .withExposedPorts(8546)
    .withCommand([
      "--http",
      "--http.addr",
      "0.0.0.0",
      "--http.port",
      "8545",
      "--http.api",
      "eth,net,web3,debug,golembase,arkiv",
      "--http.corsdomain",
      "*",
      "--ws",
      "--ws.addr",
      "0.0.0.0",
      "--ws.port",
      "8546",
      "--ws.api",
      "eth,net,web3,debug,golembase,arkiv",
      "--ws.origins",
      "*",
      "--networkid",
      "1",
      "--dev",
      "--allow-insecure-unlock",
    ])
    .withWaitStrategy(Wait.forLogMessage("HTTP server started", 1))
    .withStartupTimeout(30000)
    .withEnvironment({
      WALLET_PASSWORD: "password",
    })
    .start()

  const httpPort = container.getMappedPort(8545)
  const wsPort = container.getMappedPort(8546)
  const containerID = container.getId()

  if (withFundingAccount) {
    await execCommand(container, [
      "golembase",
      "account",
      "import",
      "--privatekey",
      withFundingAccount,
    ])
    //await container.exec(["golembase", "account", "import", "--privatekey", withFundingAccount])

    await execCommand(container, ["golembase", "account", "fund"])
  }

  return { container, httpPort, wsPort }
}

export function getArkivTestRpcUrls(options: ArkivTestRpcUrlOptions = {}) {
  const rpcUrl = options.rpcUrl ?? process.env.ARKIV_SDK_TEST_RPC_URL
  const wsUrl = options.wsUrl ?? process.env.ARKIV_SDK_TEST_WS_URL

  if (rpcUrl || wsUrl) {
    if (!rpcUrl || !wsUrl) {
      throw new Error(
        "Both ARKIV_SDK_TEST_RPC_URL and ARKIV_SDK_TEST_WS_URL must be set to use an external test network",
      )
    }

    return {
      default: { http: [rpcUrl], webSocket: [wsUrl] },
    }
  }

  if (options.httpPort === undefined || options.wsPort === undefined) {
    throw new Error("httpPort and wsPort are required when external test network URLs are not set")
  }

  return {
    default: {
      http: [`http://127.0.0.1:${options.httpPort}`],
      webSocket: [`ws://127.0.0.1:${options.wsPort}`],
    },
  }
}

export function getArkivLocalhostRpcUrls(httpPort: number, wsPort: number) {
  return getArkivTestRpcUrls({ httpPort, wsPort })
}

export async function execCommand(container: StartedTestContainer, command: string[]) {
  console.debug("Executing command", command)
  const stdout = await new Response(
    Bun.spawn(["docker", "exec", container.getId(), ...command]).stdout,
  ).text()
  console.debug("Command output", stdout)
  return stdout
}
