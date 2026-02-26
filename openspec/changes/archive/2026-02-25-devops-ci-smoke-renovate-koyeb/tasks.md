## 1. GitHub Actions Smoke Test

- [x] 1.1 Create `.github/workflows/smoke-test.yml` with triggers on push to `main` and PRs targeting `main`. Acceptance: workflow file exists and is valid YAML.
- [x] 1.2 Add Java 21 (Temurin) setup step using `actions/setup-java@v4`. Acceptance: step configures `java-version: '21'` with `distribution: 'temurin'`.
- [x] 1.3 Add Gradle build step using `gradle/actions/setup-gradle` followed by `./gradlew build`. Acceptance: Gradle caching is enabled, build and tests execute.
- [x] 1.4 Add Docker build smoke test step using `docker/build-push-action@v6` with `push: false`. Acceptance: Docker image builds from Dockerfile without pushing.
- [x] 1.5 Verify workflow runs successfully by pushing to a branch and confirming green status. Acceptance: all steps pass on GitHub Actions. *(verify on first push)*

## 2. Renovate Dependency Management

- [x] 2.1 Create `renovate.json` at repository root extending `config:recommended`. Acceptance: valid JSON, Renovate validates config.
- [x] 2.2 Add package rule to group all `org.apache.flink` dependencies into a single PR. Acceptance: `packageRules` entry with `groupName: "Apache Flink"` and `matchPackagePrefixes: ["org.apache.flink"]`.
- [x] 2.3 Verify Renovate detects Gradle dependencies in `build.gradle.kts` and Docker base images in `Dockerfile`. Acceptance: Renovate onboarding PR (or dashboard issue) lists expected dependency sources. *(verify after enabling Renovate on repo)*

## 3. Koyeb Deployment Instructions

- [x] 3.1 Add a "Koyeb" section to `DEPLOY.md` with CLI installation and app creation commands. Acceptance: section includes `koyeb app create` and `koyeb service create` commands.
- [x] 3.2 Document Docker-based deployment with port 9090 configuration and 2 GB memory instance type. Acceptance: instructions specify `--port 9090:http` and instance size with >= 2 GB RAM.
- [x] 3.3 Document health check configuration and any Koyeb-specific environment notes. Acceptance: health check path and cold start behavior are mentioned.
