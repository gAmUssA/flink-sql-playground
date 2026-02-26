## ADDED Requirements

### Requirement: Multi-stage Dockerfile
The project SHALL include a `Dockerfile` with a build stage (Gradle + JDK 21) and a runtime stage (`eclipse-temurin:21-jre`).

#### Scenario: Docker build produces runnable image
- **WHEN** `docker build -t flink-sql-fiddle .` is run in the project root
- **THEN** a Docker image SHALL be produced that starts the application on port 8080

### Requirement: JVM memory tuning
The container entrypoint SHALL include JVM flags: `-Xms512m -Xmx1536m -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m`.

#### Scenario: JVM starts with tuned settings
- **WHEN** the container starts
- **THEN** the JVM SHALL use SerialGC, allocate 512 MB initial heap, and cap at 1536 MB max heap

### Requirement: docker-compose for local development
The project SHALL include a `docker-compose.yml` that builds and runs the application with port 8080 exposed.

#### Scenario: docker-compose starts the application
- **WHEN** `docker compose up` is run in the project root
- **THEN** the application SHALL be accessible at `http://localhost:8080`

### Requirement: Container runs within 2 GB memory
The Docker container SHALL operate within a 2 GB memory limit without OOM kills under normal usage (up to 5 concurrent sessions).

#### Scenario: Memory stays within budget
- **WHEN** the container runs with `--memory=2g` and 5 sessions execute queries
- **THEN** the container SHALL NOT be OOM-killed

### Requirement: Deployment documentation
The project SHALL include deployment notes covering Fly.io and Hetzner VPS setup.

#### Scenario: Fly.io deployment instructions exist
- **WHEN** a developer reads `DEPLOY.md`
- **THEN** step-by-step instructions for deploying to Fly.io SHALL be provided
