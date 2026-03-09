import { createPublicClient, http, isHex, type Hex } from "@arkiv-network/sdk"
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers"

export const TEST_HTTP_RPC_URL_ENV = "ARKIV_TEST_HTTP_RPC_URL"
export const TEST_WS_RPC_URL_ENV = "ARKIV_TEST_WS_RPC_URL"
export const TEST_CHAIN_ID_ENV = "ARKIV_TEST_CHAIN_ID"
export const TEST_CHAIN_NAME_ENV = "ARKIV_TEST_CHAIN_NAME"

const DEFAULT_TEST_CHAIN_ID = 1337
const DEFAULT_TEST_CHAIN_NAME = "Localhost"
const DEFAULT_EXTERNAL_CHAIN_NAME = "External RPC"

export type TestTransport = "http" | "webSocket"

type ArkivTestChain = {
  id: number
  name: string
  nativeCurrency: {
    decimals: number
    name: string
    symbol: string
  }
  rpcUrls: {
    default: {
      http: string[]
      webSocket?: string[]
    }
  }
}

type ArkivTestConfig =
  | {
      mode: "docker"
      chainId: number
      chainName: string
      privateKey: Hex
      transports: TestTransport[]
    }
  | {
      mode: "external"
      chainId?: number
      chainName: string
      httpRpcUrl: string
      wsRpcUrl?: string
      privateKey: Hex
      transports: TestTransport[]
    }

export type ArkivTestEnvironment = {
  chain: ArkivTestChain
  container?: StartedTestContainer
  httpRpcUrl: string
  wsRpcUrl?: string
  privateKey: Hex
  stop: () => Promise<void>
  transports: TestTransport[]
}

function getRequiredPrivateKey(env: NodeJS.ProcessEnv): Hex {
  const privateKey = env.PRIVATE_KEY
  if (!privateKey) {
    throw new Error("PRIVATE_KEY env var is required")
  }

  if (!isHex(privateKey)) {
    throw new Error("Malformed PRIVATE_KEY: must be a hex string")
  }

  return privateKey
}

function parseOptionalChainId(rawChainId: string | undefined) {
  if (!rawChainId) {
    return undefined
  }

  const chainId = Number(rawChainId)
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`${TEST_CHAIN_ID_ENV} must be a positive integer`)
  }

  return chainId
}

function createArkivTestChain(
  chainId: number,
  chainName: string,
  httpRpcUrl: string,
  wsRpcUrl?: string,
): ArkivTestChain {
  return {
    id: chainId,
    name: chainName,
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    rpcUrls: getArkivRpcUrls(httpRpcUrl, wsRpcUrl),
  }
}

export function getArkivTestConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ArkivTestConfig {
  const privateKey = getRequiredPrivateKey(env)
  const httpRpcUrl = env[TEST_HTTP_RPC_URL_ENV]
  const wsRpcUrl = env[TEST_WS_RPC_URL_ENV]
  const chainId = parseOptionalChainId(env[TEST_CHAIN_ID_ENV])
  const chainName = env[TEST_CHAIN_NAME_ENV]?.trim()

  if (!httpRpcUrl) {
    return {
      mode: "docker",
      privateKey,
      chainId: chainId ?? DEFAULT_TEST_CHAIN_ID,
      chainName: chainName || DEFAULT_TEST_CHAIN_NAME,
      transports: ["http", "webSocket"],
    }
  }

  return {
    mode: "external",
    privateKey,
    httpRpcUrl,
    wsRpcUrl,
    chainId,
    chainName: chainName || DEFAULT_EXTERNAL_CHAIN_NAME,
    transports: wsRpcUrl ? ["http", "webSocket"] : ["http"],
  }
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

export function getArkivRpcUrls(httpRpcUrl: string, wsRpcUrl?: string) {
  return {
    default: {
      http: [httpRpcUrl],
      ...(wsRpcUrl ? { webSocket: [wsRpcUrl] } : {}),
    },
  }
}

export function getArkivLocalhostRpcUrls(httpPort: number, wsPort: number) {
  return getArkivRpcUrls(`http://127.0.0.1:${httpPort}`, `ws://127.0.0.1:${wsPort}`)
}

export async function resolveArkivTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ArkivTestEnvironment> {
  const config = getArkivTestConfigFromEnv(env)

  if (config.mode === "external") {
    const chainId =
      config.chainId ??
      Number(await createPublicClient({ transport: http(config.httpRpcUrl) }).getChainId())

    return {
      chain: createArkivTestChain(chainId, config.chainName, config.httpRpcUrl, config.wsRpcUrl),
      httpRpcUrl: config.httpRpcUrl,
      wsRpcUrl: config.wsRpcUrl,
      privateKey: config.privateKey,
      stop: async () => {},
      transports: config.transports,
    }
  }

  const { container, httpPort, wsPort } = await launchLocalArkivNode(config.privateKey)
  const httpRpcUrl = `http://127.0.0.1:${httpPort}`
  const wsRpcUrl = `ws://127.0.0.1:${wsPort}`

  return {
    chain: createArkivTestChain(config.chainId, config.chainName, httpRpcUrl, wsRpcUrl),
    container,
    httpRpcUrl,
    wsRpcUrl,
    privateKey: config.privateKey,
    stop: async () => {
      await container.stop()
    },
    transports: config.transports,
  }
}

export async function execCommand(container: StartedTestContainer, command: string[]) {
  console.debug("Executing command", command)
  const stdout = await new Response(
    Bun.spawn(["docker", "exec", container.getId(), ...command]).stdout,
  ).text()
  console.debug("Command output", stdout)
  return stdout
}
