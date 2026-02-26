## 1. Gradle Project Setup

- [x] 1.1 Create `settings.gradle.kts` with `rootProject.name = "flink-sql-fiddle"`. Acceptance: file exists.
- [x] 1.2 Create `build.gradle.kts` with Spring Boot 3.5.11 plugin, `io.spring.dependency-management` plugin, Java 21 toolchain, and `spring-boot-starter-web` dependency. Acceptance: `./gradlew dependencies` succeeds.
- [x] 1.3 Add Flink 2.2.0 dependency block with `flinkVersion` val and all 7 artifacts (`flink-streaming-java`, `flink-clients`, `flink-table-api-java`, `flink-table-api-java-bridge`, `flink-table-planner-loader`, `flink-table-runtime`, `flink-connector-datagen`) at implementation scope. Acceptance: `./gradlew dependencies` shows all Flink artifacts.
- [x] 1.4 Generate Gradle wrapper with `gradle wrapper`. Acceptance: `gradlew`, `gradlew.bat`, and `gradle/wrapper/` exist.

## 2. Directory Structure

- [x] 2.1 Create `src/main/java/com/flinksqlfiddle/` directory tree. Acceptance: directory exists.
- [x] 2.2 Create `src/main/resources/` directory. Acceptance: directory exists.

## 3. Application Entrypoint

- [x] 3.1 Create `FlinkSqlFiddleApplication.java` in `com.flinksqlfiddle` package with `@SpringBootApplication` annotation and `main()` method calling `SpringApplication.run()`. Acceptance: class compiles.

## 4. Configuration

- [x] 4.1 Create `src/main/resources/application.yaml` with `server.port` and `spring.application.name: flink-sql-fiddle`. Acceptance: application starts on configured port.

## 5. Git Configuration

- [x] 5.1 Create `.gitignore` excluding `build/`, `.gradle/`, `.idea/`, `*.iml`, `.classpath`, `.project`, `.settings/`, `*.class`, `.DS_Store`. Acceptance: `git status` does not show build artifacts.

## 6. Verification

- [x] 6.1 Run `./gradlew clean build -x test` and verify the build produces `build/libs/flink-sql-fiddle.jar`. Acceptance: JAR exists and is executable.
