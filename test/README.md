# ArkivJS Integration Tests

This directory contains integration tests for ArkivJS using GolemDB container.

## Prerequisites

- Docker installed and running
- Bun runtime
- ArkivJS package built and packaged as `arkivjs-0.0.1.tgz`

## Setup

1. Build and package the main ArkivJS library:
   ```bash
   cd ..
   bun run package
   ```

2. Install test dependencies:
   ```bash
   bun install
   ```

## Running Tests

### Run all tests:
```bash
bun test
```

### Run only GolemDB integration tests:
```bash
bun run test:golemdb
```

### Run tests in watch mode:
```bash
bun run test:watch
```

## Test Structure

The tests use [Testcontainers](https://github.com/testcontainers/testcontainers-node) to spin up a GolemDB container using the official `golemnetwork/golembase-op-geth` Docker image.

### Test Coverage

- ✅ Container startup and connection
- ✅ Basic RPC functionality (chainId, blockNumber)
- ✅ Custom `golembase_getStorageValue` RPC method
- ✅ `getEntityByKey` functionality
- ✅ Error handling for non-existent keys

### Container Configuration

The GolemDB container is configured with:
- HTTP RPC on port 8545
- WebSocket RPC on port 8546
- Development mode with insecure unlock
- Custom RPC methods enabled: `golembase`
- CORS enabled for testing

## Troubleshooting

### Container fails to start
- Ensure Docker is running
- Check if ports 8545/8546 are available
- Verify the Docker image exists: `docker pull golemnetwork/golembase-op-geth:latest`

### Test timeouts
- Increase timeout in `bunfig.toml` if needed
- Check container logs for startup issues

### RPC method not found
- Verify the container supports `golembase_getStorageValue`
- Check if the method name matches the expected API