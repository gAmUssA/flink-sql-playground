## Why

The Flink SQL Fiddle has no codebase yet — only a blueprint (`docs/flink-sql-fiddle-blueprint.md`). Before any feature work can begin, we need a buildable Gradle project with Spring Boot 3.5.x, all required Flink 2.2.x dependencies, an application entrypoint, and baseline configuration. This is the foundation every subsequent change depends on.

## What Changes

- Create a `build.gradle.kts` with Spring Boot 3.5.11 plugin, Java 21 toolchain, and all Flink 2.2.0 dependencies (streaming-java, clients, table-api-java, table-api-java-bridge, table-planner-loader, table-runtime, connector-datagen)
- Create `settings.gradle.kts` with project name
- Generate Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/`)
- Add a Spring Boot `@SpringBootApplication` entrypoint class
- Add `application.yaml` with server port, application name, and placeholder sections for future configuration
- Create the standard `src/main/java` and `src/main/resources` directory structure
- Add a `.gitignore` for Java/Gradle/IDE artifacts

## Capabilities

### New Capabilities
- `project-structure`: Gradle project layout, dependency management, Spring Boot entrypoint, and base configuration

### Modified Capabilities

## Impact

- **Dependencies**: Introduces Spring Boot 3.5.11 BOM and 7 Flink 2.2.0 artifacts as implementation-scope dependencies
- **Build**: Project becomes buildable with `./gradlew build`; produces a fat JAR via Spring Boot Gradle plugin
- **Code**: New `src/main/java/com/flinksqlfiddle/FlinkSqlFiddleApplication.java` entrypoint
- **Config**: New `src/main/resources/application.yaml`
