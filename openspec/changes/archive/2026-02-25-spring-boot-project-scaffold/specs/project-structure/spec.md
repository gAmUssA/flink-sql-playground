## ADDED Requirements

### Requirement: Gradle project builds successfully
The project SHALL be a valid Gradle project with `build.gradle.kts` and `settings.gradle.kts` at the repository root that compiles and packages without errors using `./gradlew build`.

#### Scenario: Clean build succeeds
- **WHEN** a developer runs `./gradlew clean build -x test` in the project root
- **THEN** the build SHALL succeed and produce an executable JAR in `build/libs/`

### Requirement: Gradle wrapper is included
The project SHALL include a Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, `gradle/wrapper/gradle-wrapper.properties`) so no local Gradle installation is required.

#### Scenario: Build works without Gradle installed
- **WHEN** a developer with only a JDK (no Gradle) runs `./gradlew build`
- **THEN** Gradle SHALL be downloaded automatically and the build SHALL succeed

### Requirement: Spring Boot application starts
The project SHALL include a `@SpringBootApplication` entrypoint class at `com.flinksqlfiddle.FlinkSqlFiddleApplication` that starts a web server.

#### Scenario: Application starts on configured port
- **WHEN** the packaged JAR is executed with `java -jar build/libs/flink-sql-fiddle.jar`
- **THEN** the application SHALL start and listen on the configured port

### Requirement: All Flink dependencies are included at implementation scope
The `build.gradle.kts` SHALL declare all required Flink 2.2.0 dependencies at implementation scope: `flink-streaming-java`, `flink-clients`, `flink-table-api-java`, `flink-table-api-java-bridge`, `flink-table-planner-loader`, `flink-table-runtime`, and `flink-connector-datagen`.

#### Scenario: Flink classes are available at runtime
- **WHEN** the application starts
- **THEN** `org.apache.flink.table.api.TableEnvironment` SHALL be loadable from the classpath

### Requirement: Application configuration via YAML
The project SHALL include `src/main/resources/application.yaml` with server port and application name configured.

#### Scenario: Server port is configurable
- **WHEN** `application.yaml` sets `server.port`
- **THEN** the application SHALL listen on that port

### Requirement: Standard directory structure
The project SHALL follow standard Java project layout with `src/main/java`, `src/main/resources`, and a `.gitignore` excluding build artifacts, IDE files, and OS-specific files.

#### Scenario: Source directories exist
- **WHEN** a developer clones the repository
- **THEN** `src/main/java/com/flinksqlfiddle/` and `src/main/resources/` directories SHALL exist
