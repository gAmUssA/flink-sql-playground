## Why

The project has no README or developer documentation. Contributors and users cannot discover how to build the project locally with Gradle, run it via Docker, or understand prerequisites (Java 21, Docker). Adding a README removes this onboarding friction and is standard practice for any open-source project.

## What Changes

- Add a `README.md` at the project root with:
  - Project overview (what Flink SQL Playground is)
  - Prerequisites (Java 21, Docker)
  - Local Java build & run instructions (`./gradlew build`, `./gradlew bootRun`)
  - Docker build & run instructions (`docker compose up`)
  - How to run tests
  - Link to the blueprint for deeper architecture details

## Capabilities

### New Capabilities
- `local-build-docs`: README documentation covering Java and Docker local development workflows

### Modified Capabilities

## Impact

- New file: `README.md` at project root
- No code changes, no dependency changes, no API changes
