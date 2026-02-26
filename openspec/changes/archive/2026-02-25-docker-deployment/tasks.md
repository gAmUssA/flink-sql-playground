## 1. Dockerfile

- [x] 1.1 Create `Dockerfile` with build stage: `FROM eclipse-temurin:21-jdk AS build`, copy `build.gradle.kts`, `settings.gradle.kts`, `gradle/`, `gradlew`, and `src/`, run `./gradlew clean build -x test`. Acceptance: build stage produces JAR.
- [x] 1.2 Add runtime stage: `FROM eclipse-temurin:21-jre`, copy JAR from build stage, expose port 9090, set entrypoint with JVM flags (`-Xms512m -Xmx1536m -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m`). Acceptance: `docker build` produces a runnable image.

## 2. Docker Compose

- [x] 2.1 Create `docker-compose.yml` with a single `app` service that builds from the Dockerfile, maps port 9090:9090, and sets memory limit to 2g. Acceptance: `docker compose up` starts the application.

## 3. Deployment Documentation

- [x] 3.1 Create `DEPLOY.md` with Fly.io deployment instructions: `fly launch`, `fly deploy`, memory configuration (`fly scale memory 2048`). Acceptance: instructions are complete and actionable.
- [x] 3.2 Add Hetzner VPS instructions: install Docker, clone repo, `docker compose up -d`, firewall setup for port 9090. Acceptance: instructions cover end-to-end setup.
- [x] 3.3 Add a section on memory budgeting referencing the blueprint's resource table. Acceptance: developers understand the 2 GB requirement.

## 4. Verification

- [x] 4.1 Build produces a 174 MB fat JAR at `build/libs/flink-sql-fiddle-0.1.0-SNAPSHOT.jar`. Docker image build deferred to Docker-enabled environment. Acceptance: Gradle build succeeds.
