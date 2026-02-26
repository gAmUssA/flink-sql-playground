## ADDED Requirements

### Requirement: CI workflow runs on push and pull request
The system SHALL execute a GitHub Actions workflow on every push to `main` and on every pull request targeting `main`.

#### Scenario: Push to main triggers CI
- **WHEN** a commit is pushed to the `main` branch
- **THEN** the smoke-test workflow SHALL execute

#### Scenario: Pull request triggers CI
- **WHEN** a pull request is opened or updated targeting `main`
- **THEN** the smoke-test workflow SHALL execute

### Requirement: CI builds the Gradle project with Java 21
The workflow SHALL set up Java 21 (Temurin distribution) and build the project using `./gradlew build`.

#### Scenario: Successful Gradle build
- **WHEN** the CI workflow executes the Gradle build step
- **THEN** the project SHALL compile and all unit tests SHALL pass

#### Scenario: Build failure blocks merge
- **WHEN** the Gradle build or tests fail
- **THEN** the workflow SHALL report a failure status on the PR

### Requirement: CI verifies Docker image builds
The workflow SHALL execute a Docker build using the project Dockerfile to verify the image builds successfully, without pushing to any registry.

#### Scenario: Docker build smoke test passes
- **WHEN** the Gradle build succeeds
- **THEN** the workflow SHALL build the Docker image from `Dockerfile`
- **AND** the Docker build SHALL complete without errors

#### Scenario: Docker build failure is reported
- **WHEN** the Docker image build fails
- **THEN** the workflow SHALL report a failure status

### Requirement: CI uses Gradle build caching
The workflow SHALL use `gradle/actions/setup-gradle` to cache Gradle dependencies and build outputs across runs.

#### Scenario: Cached build is faster
- **WHEN** the workflow runs with a warm cache from a previous run
- **THEN** Gradle dependency resolution SHALL use cached artifacts
