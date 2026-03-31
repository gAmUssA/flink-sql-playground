## 1. Create README

- [x] 1.1 Create `README.md` at project root with project overview section (1-2 sentence description of Flink SQL Playground). Acceptance: file exists, overview is accurate.
- [x] 1.2 Add Prerequisites section listing Java 21 and Docker. Acceptance: versions match `build.gradle.kts` and `Dockerfile`.
- [x] 1.3 Add Local Java Build section with `./gradlew build` and `./gradlew bootRun` commands, noting the app runs at `http://localhost:9090`. Acceptance: commands match actual build system.
- [x] 1.4 Add Docker Build section with `docker compose up --build` command, noting the app runs at `http://localhost:9090`. Acceptance: command matches `docker-compose.yml`.
- [x] 1.5 Add Running Tests section with `./gradlew test`. Acceptance: command is correct.
- [x] 1.6 Add Architecture link pointing to `docs/flink-sql-fiddle-blueprint.md`. Acceptance: relative link is valid.

## 2. Verify

- [x] 2.1 Verify all commands in README match actual project configuration (port 9090, Java 21, Gradle wrapper). Acceptance: no discrepancies between README and config files.
