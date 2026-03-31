## ADDED Requirements

### Requirement: README contains project overview
The README SHALL include a brief description of Flink SQL Playground — an interactive web-based SQL editor for Apache Flink with an embedded MiniCluster.

#### Scenario: Developer reads project overview
- **WHEN** a developer opens README.md
- **THEN** they see a 1-2 sentence description of what the project does

### Requirement: README documents prerequisites
The README SHALL list all prerequisites: Java 21 and Docker (optional, for container workflow).

#### Scenario: Developer checks prerequisites
- **WHEN** a developer reads the Prerequisites section
- **THEN** they see Java 21 and Docker listed with version requirements

### Requirement: README documents local Java build
The README SHALL document how to build and run the project using Gradle: `./gradlew build` to build, `./gradlew bootRun` to run, and access at `http://localhost:9090`.

#### Scenario: Developer builds with Gradle
- **WHEN** a developer runs `./gradlew build`
- **THEN** the project compiles and tests pass

#### Scenario: Developer runs with Gradle
- **WHEN** a developer runs `./gradlew bootRun`
- **THEN** the app starts and is accessible at http://localhost:9090

### Requirement: README documents Docker build
The README SHALL document how to build and run using Docker Compose: `docker compose up --build` and access at `http://localhost:9090`.

#### Scenario: Developer runs with Docker Compose
- **WHEN** a developer runs `docker compose up --build`
- **THEN** the app builds in a container and is accessible at http://localhost:9090

### Requirement: README documents running tests
The README SHALL document how to run the test suite: `./gradlew test`.

#### Scenario: Developer runs tests
- **WHEN** a developer runs `./gradlew test`
- **THEN** all tests execute and results are displayed

### Requirement: README links to architecture docs
The README SHALL link to `docs/flink-sql-fiddle-blueprint.md` for architecture details.

#### Scenario: Developer wants architecture details
- **WHEN** a developer looks for deeper technical documentation
- **THEN** the README links to the blueprint document
