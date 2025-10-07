import type { Hex } from "arkiv"
import { GenericContainer, Wait } from "testcontainers"

export async function launchLocalArkivNode(withFundingAccount: Hex | undefined = undefined) {
	const container = await new GenericContainer("golemnetwork/golembase-op-geth:latest")
		.withExposedPorts(8545)
		.withExposedPorts(8546)
		.withCommand([
			"--http",
			"--http.addr",
			"0.0.0.0",
			"--http.port",
			"8545",
			"--http.api",
			"eth,net,web3,golembase",
			"--http.corsdomain",
			"*",
			"--ws",
			"--ws.addr",
			"0.0.0.0",
			"--ws.port",
			"8546",
			"--ws.api",
			"eth,net,web3,golembase",
			"--ws.origins",
			"*",
			"--networkid",
			"1",
			"--dev",
			"--allow-insecure-unlock",
		])
		.withWaitStrategy(Wait.forLogMessage("HTTP server started", 1))
		.withStartupTimeout(30000)
		.start()

	const httpPort = container.getMappedPort(8545)
	const wsPort = container.getMappedPort(8546)

	if (withFundingAccount) {
		console.log("Funding account", withFundingAccount)
		await container.exec(["golembase", "account", "import", "--privatekey", withFundingAccount])
		await container.exec(["golembase", "account", "fund"])
	}

	return { container, httpPort, wsPort }
}
export function getArkivLocalhostRpcUrls(httpPort: number, wsPort: number) {
	return {
		default: { http: [`http://127.0.0.1:${httpPort}`], webSocket: [`ws://127.0.0.1:${wsPort}`] },
	}
}
