## Context

The Flink SQL Fiddle project currently has no CI pipeline — builds and tests run only locally. Dependencies (Spring Boot 3.5.x, Flink 2.2.x, Gradle, Temurin base images) are managed manually. Deployment docs cover Fly.io and Hetzner VPS but not Koyeb, a Docker-native PaaS with a free tier and 2 GB memory instances.

The project uses Gradle (Kotlin DSL) with Java 21, produces a single fat JAR via Spring Boot plugin, and deploys as a Docker container exposing port 9090.

## Goals / Non-Goals

**Goals:**
- Catch build/test regressions automatically on every push and PR via GitHub Actions
- Verify the Docker image builds successfully as part of CI (smoke test)
- Automate dependency update PRs for Gradle dependencies and Docker base images via Renovate
- Document Koyeb deployment with correct memory (2 GB+) and port (9090) configuration

**Non-Goals:**
- Full integration testing with running Flink queries in CI (too memory-intensive for free runners)
- Automated deployment / CD pipelines (manual deploy is fine for MVP)
- Removing existing Fly.io or Hetzner deployment docs
- Publishing Docker images to a registry

## Decisions

### 1. Single GitHub Actions workflow with matrix-free sequential jobs

**Decision**: One workflow file (`.github/workflows/smoke-test.yml`) with a single job that runs build, test, and Docker build in sequence.

**Rationale**: The project is a single Gradle module. A matrix build or separate jobs would add complexity for no benefit. Sequential steps share the Gradle cache and workspace.

**Alternatives considered**:
- Separate workflows for build vs Docker — rejected, more YAML to maintain with no parallelism benefit
- Matrix testing across JDK versions — rejected, project targets Java 21 only

### 2. Gradle build cache via `actions/setup-gradle`

**Decision**: Use `gradle/actions/setup-gradle` for automatic Gradle dependency and build caching.

**Rationale**: This action handles Gradle wrapper validation and caching. Reduces build time on cache hits by ~60%.

### 3. Docker build without push

**Decision**: Use `docker/build-action` with `push: false` to verify the Dockerfile builds but not publish.

**Rationale**: Smoke testing the Docker build catches Dockerfile issues early. No registry push needed for MVP.

### 4. Renovate with grouped Flink updates

**Decision**: Configure Renovate with `extends: ["config:recommended"]`, group all `org.apache.flink` dependencies into a single PR, and enable Docker base image updates for `eclipse-temurin`.

**Rationale**: Flink dependencies should be updated together to maintain version consistency. Grouping avoids N separate PRs for the same version bump.

**Alternatives considered**:
- Dependabot — rejected, Renovate has better grouping and auto-merge capabilities
- Manual updates — rejected, easy to fall behind on security patches

### 5. Koyeb Docker-based deployment

**Decision**: Document Koyeb deployment using Docker image deployment via the Koyeb CLI, with 2 GB memory instance and port 9090 configuration.

**Rationale**: Koyeb supports Docker-based deployments natively, offers a free tier, and has straightforward CLI tooling. The 2 GB memory matches the app's memory budget documented in DEPLOY.md.

## Risks / Trade-offs

- **[Flink tests may be flaky on CI runners]** → GitHub-hosted runners have 7 GB RAM, which is sufficient for the embedded MiniCluster, but timing-sensitive tests may need adjustment. Mitigation: start with build + unit tests only; add integration tests later.
- **[Renovate PRs may break the build]** → Flink minor version bumps can have breaking API changes. Mitigation: CI smoke test runs on Renovate PRs, blocking merge if tests fail.
- **[Koyeb free tier limitations]** → Free tier may have cold start delays or limited uptime. Mitigation: document this clearly as a demo/playground option, not production hosting.
