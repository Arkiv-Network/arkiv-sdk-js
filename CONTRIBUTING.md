# Contributing to ArkivJS

Thank you for your interest in contributing to ArkivJS! This document outlines the development workflow and guidelines for contributing to this project.

## Branch Structure

The project follows a Git Flow-inspired branching model:

- **`develop`** - Main integration branch where all development happens. This is the default branch for ongoing work.
- **`main`** - Production/release branch that reflects the current stable release. This branch should always be in a deployable state.
- **Feature/Bugfix branches** - Created from `develop` for implementing new features or fixing bugs. These are merged back into `develop`.

## Development Workflow

### 1. Starting Work

1. Ensure you're on the latest `develop` branch:
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. Create a new branch from `develop`:
   ```bash
   # For features
   git checkout -b feature/your-feature-name
   
   # For bug fixes
   git checkout -b bugfix/your-bugfix-name
   ```

### 2. Making Changes

- Write clean, well-documented code
- Follow the existing code style (enforced by Biome linter)
- Add tests for new functionality
- Update documentation as needed

### 3. Running Tests Locally

Before submitting a pull request, ensure all tests pass locally:

```bash
# Run linting
bun run lint

# Run type checking
bun run type-check

# Run unit tests
bun run test:unit

# Build the package
bun run build
```

For integration tests, see the [test/README.md](./test/README.md) for setup instructions.

### 4. Submitting Changes

1. Commit your changes with clear, descriptive commit messages
2. Rebase your branch on top of current `develop` branch
3. Push your branch to the remote repository
4. Open a Pull Request targeting the `develop` branch

### 5. CI Pipeline

When you create a Pull Request to `develop`, the CI pipeline automatically runs:

1. **Lint Checking** - Validates code style using Biome
2. **Unit Tests** - Runs all unit tests in `src/**/*`
3. **Smoke Tests** - Validates package compatibility across different module formats
4. **Component Tests** - Integration tests with GolemDB using Docker containers

All checks must pass before a PR can be merged.

### 6. After Merge to Develop

Once your PR is merged into `develop`:

- The package is automatically built and published to NPM
- Version is automatically managed with a `-dev` postfix (e.g., `0.1.0-dev.0`, `0.1.0-dev.1`)
- Package is published with the `dev` tag, indicating it's a development version and may be unstable
- Anyone can install it with: `npm install @arkiv-network/sdk@dev`

## Release Process

### Releasing to Production

When `develop` is ready for release:

1. Merge `develop` into `main`:
   ```bash
   git checkout main
   git pull origin main
   git merge develop
   git push origin main
   ```

2. Upon merge to `main`:
   - The package is automatically built
   - Published to NPM with the version from `package.json`
   - Published without the `dev` tag (stable release)
   - No version postfix is added

### Hot Fixes

For critical bugs that need to be fixed in production:

1. Create a bugfix branch directly from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b bugfix/hotfix-description
   ```

2. Make the fix and commit
3. Merge back into `main`:
   ```bash
   git checkout main
   git merge bugfix/hotfix-description
   git push origin main
   ```

4. The patch version should be incremented (e.g., `1.2.3` → `1.2.4`)
5. The fix should also be merged back into `develop` to keep it in sync

**Note:** No release version branches are needed - only use branches for major version releases if special handling is required.

## Versioning

This project follows [Semantic Versioning](https://semver.org/) (SemVer): `x.y.z`

- **Patch version** (`x.y.Z`) - Incremented for bug fixes that don't add functionality or break compatibility
- **Minor version** (`x.Y.z`) - Incremented when new features are added in a backward-compatible manner
- **Major version** (`X.y.z`) - Incremented when breaking compatibility changes are introduced

Version management is handled manually with the exception of `develop` branch and `dev` tag where the CI/CD pipeline add automatically -dev.X postfix and increase `X` in case it already exists. So developers doesn't have to remember about changing versions constantly to have most recent dev publish.

## CI/CD Pipeline Details

The continuous integration pipeline runs the following checks in sequence:

### 1. Lint
- Validates code style and formatting using Biome
- Command: `bun run lint`

### 2. Unit Tests
- Runs all unit tests in the source code
- Command: `bun run test:unit`
- Must pass before proceeding

### 3. Smoke Tests
- Validates package compatibility across different module formats (ESM, CommonJS)
- Tests package installation and basic functionality
- Runs in the `test/` directory

### 4. Component Tests
- Integration tests with GolemDB using Docker containers
- Validates full SDK functionality against a real GolemDB instance
- Uses Testcontainers for isolated testing environments

### 5. Publish
- Only runs after all tests pass
- Automatically publishes to NPM based on the target branch:
  - `develop` → Published with `dev` tag and `-dev` postfix
  - `main` → Published as stable release with version from `package.json`

## Development Setup

For detailed information about building and developing the SDK, see:

- [BUILD.md](./BUILD.md) - Build configuration and output structure
- [README.md](./README.md) - General project information and usage examples

## Getting Help

- Check existing issues and pull requests
- Review the codebase and documentation
- Open an issue for bugs or feature requests
- Ask questions in discussions (if available)

Thank you for contributing to Arkiv!

