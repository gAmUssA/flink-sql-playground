## Why

The project has no CI pipeline, no automated dependency updates, and deployment docs only cover Fly.io and Hetzner VPS. Adding GitHub Actions smoke tests catches regressions on every push, Renovate keeps dependencies (Spring Boot, Flink, Gradle) current automatically, and Koyeb deployment instructions provide a Docker-native PaaS alternative with a free tier suitable for the ~2 GB memory budget.

## What Changes

- Add a GitHub Actions workflow that builds the Gradle project, runs tests, and performs a Docker build smoke test on every push/PR
- Add a Renovate configuration (`renovate.json`) for automated dependency PRs targeting Gradle dependencies and the Dockerfile base image
- Add Koyeb deployment instructions to `DEPLOY.md` covering Docker-based deployment on Koyeb with the correct memory/port configuration

## Capabilities

### New Capabilities
- `ci-smoke-test`: GitHub Actions workflow for build verification and Docker smoke test on push/PR
- `renovate-dependency-management`: Renovate bot configuration for automated Gradle and Docker dependency updates
- `koyeb-deployment`: Koyeb PaaS deployment instructions with Docker-based deploy and memory configuration

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **New files**: `.github/workflows/smoke-test.yml`, `renovate.json`
- **Modified files**: `DEPLOY.md` (new Koyeb section)
- **Dependencies**: None added to build.gradle.kts — these are infrastructure-only changes
- **Systems**: GitHub Actions CI, Renovate bot (requires enabling on the repo), Koyeb (new deployment target)
