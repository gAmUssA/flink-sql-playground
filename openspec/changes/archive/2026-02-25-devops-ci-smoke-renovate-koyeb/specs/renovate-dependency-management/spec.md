## ADDED Requirements

### Requirement: Renovate configuration exists
The repository SHALL contain a `renovate.json` file at the root that extends `config:recommended`.

#### Scenario: Renovate is configured
- **WHEN** the Renovate bot is enabled on the repository
- **THEN** it SHALL find and use the `renovate.json` configuration file

### Requirement: Gradle dependencies are updated automatically
Renovate SHALL detect and create PRs for updates to dependencies defined in `build.gradle.kts`.

#### Scenario: Spring Boot version update available
- **WHEN** a new Spring Boot 3.5.x patch version is released
- **THEN** Renovate SHALL create a PR updating the Spring Boot plugin version in `build.gradle.kts`

#### Scenario: Flink dependencies updated together
- **WHEN** a new Apache Flink version is released
- **THEN** Renovate SHALL create a single PR updating all `org.apache.flink` dependencies together as a group

### Requirement: Docker base image updates are tracked
Renovate SHALL detect and create PRs for updates to the `eclipse-temurin` base images in the `Dockerfile`.

#### Scenario: Temurin JDK base image update
- **WHEN** a new `eclipse-temurin:21-jdk` image tag is available
- **THEN** Renovate SHALL create a PR updating the `FROM` line in the `Dockerfile`

#### Scenario: Temurin JRE runtime image update
- **WHEN** a new `eclipse-temurin:21-jre` image tag is available
- **THEN** Renovate SHALL create a PR updating the runtime `FROM` line in the `Dockerfile`

### Requirement: Gradle wrapper version is tracked
Renovate SHALL detect and create PRs for Gradle wrapper updates.

#### Scenario: Gradle wrapper update available
- **WHEN** a new Gradle version is released
- **THEN** Renovate SHALL create a PR updating the Gradle wrapper version
