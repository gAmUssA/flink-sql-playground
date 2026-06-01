# Migration Report: flink-sql-playground (Spring Boot → Quarkus)

## Summary
- **Strategy:** Native Quarkus (full migration — no `quarkus-spring-*` compat extensions)
- **Agent:** claude
- **Model:** claude-opus-4-8
- **Quarkus version:** 3.36.0 (Java 25, the project's existing toolchain)
- **Modules completed:** 4/4 (build, code, frontend, testing) + cleanup
- **Checks passed:** 6/6
- **Token usage:** not precisely tracked this session (approx. low-millions input via cached context / tens-of-thousands output)
- **Branch:** `migration/run-01` (isolated worktree)

The app is a Spring Boot 4 service that embeds an Apache Flink 2.2.1 MiniCluster to run
ad-hoc Flink SQL, with a vanilla-JS/Monaco frontend served as static resources and H2/
PostgreSQL (Flyway) persistence for shareable "fiddles". It now runs on Quarkus 3.36 in
JVM mode, booting in **~1.4s**.

## Changes by Module

| Module | Files changed | Key changes |
|--------|--------------|-------------|
| **build** | `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, `application.properties` (new), `application-supabase.properties` (new), removed `application*.yaml` | Spring Boot + dependency-management plugins → `io.quarkus` plugin + `enforcedPlatform(quarkus-bom)`; starters → `quarkus-rest`, `quarkus-rest-jackson`, `quarkus-hibernate-orm-panache`, `quarkus-hibernate-validator`, `quarkus-jdbc-h2`, `quarkus-jdbc-postgresql`, `quarkus-flyway`; YAML config → `.properties` (`quarkus.*`); **`quarkus.package.jar.type=uber-jar`** (see Flink note). Kept the custom `generateBuildInfo` task and `smokeTest` split. |
| **code** | 5 controllers → JAX-RS resources, `GlobalExceptionHandler`, `FiddleService`/`FiddleRepository`, `SessionManager`, `SqlExecutionService`, `SqlSecurityValidator`, `FlinkEnvironmentFactory`, `FlinkProperties`/`ExecutionLimits`, new `AppConfig`/`FlinkConfig`/`ExecutionConfig`/`StartupLogger`, removed `FlinkSqlFiddleApplication`/`WebConfig` | `@RestController`→`@Path`+JAX-RS; `@Service`/`@Component`→`@ApplicationScoped`, `@Autowired`→`@Inject`; `@RestControllerAdvice`→`@ServerExceptionMapper`; Spring Data `JpaRepository`→Panache `PanacheRepositoryBase` + `@jakarta.transaction.Transactional`; `@ConfigurationProperties` records → `@ConfigMapping` interfaces mapped into the (retained) domain records by a CDI producer; `ApplicationReadyEvent`→`@Observes StartupEvent`; **NDJSON streaming `ResponseBodyEmitter`→`Multi<StreamEvent>`** (`application/x-ndjson`); Jackson 3 (`tools.jackson`)→Jackson 2 (`com.fasterxml`). |
| **frontend** | Moved `static/**`→`META-INF/resources/**`; new `SpaResource` | Quarkus serves static assets from `META-INF/resources`; the Spring MVC `forward:/index.html` SPA controller became a JAX-RS resource serving `index.html` for `/f/**`. No CSRF (no Spring Security); DTO JSON shapes unchanged, so `app.js` needed no edits. |
| **testing** | `ApplicationContextTest`, 3 controller tests → `*ResourceTest`, `FiddleServiceTest` | `@SpringBootTest`/`@WebMvcTest`+`MockMvc`→`@QuarkusTest`+RestAssured; `@MockitoBean`→`@InjectMock`; `FiddleServiceTest` updated for Panache (`findByIdOptional`/`persist`). Plain unit + Flink smoke tests kept as-is. |
| **cleanup** | removed `logback-spring.xml` | Logback (Spring-only) → `quarkus.log.*` categories (incl. the Flink-noise suppressions). Zero `org.springframework`/`tools.jackson` references remain. |
| **deploy** | `Dockerfile`, `Dockerfile.runtime`, `docker-compose.yml` (unchanged), `.github/workflows/docker-publish.yml` | `bootJar`+`jarmode extract`→`quarkusBuild` uber-jar (`*-runner.jar`, no extraction needed); CI/Docker build JVM 21→**25** (augmentation requirement). |

## Validation Results

| Check | Result | Notes |
|-------|--------|-------|
| Builds | PASS | `./gradlew clean test quarkusBuild` succeeds on JDK 25 |
| No Spring deps | PASS | No `org.springframework` anywhere in `src/` or build files |
| Has Quarkus | PASS | `quarkus-bom` + 11 extensions installed |
| Tests pass | PASS | 69 fast + 28 Flink MiniCluster smoke = **97/97** |
| Starts up | PASS | Boots in ~1.4s; verified live: datagen aggregate query, **faker connector**, **NDJSON streaming**, fiddle save/load (Panache), SPA route, 404/403/500 error paths |
| No leftover templates | PASS | N/A — no Thymeleaf/JSP; static assets relocated |

## Unmigrated Code (TODOs)
None. No `// TODO: Migration required` markers were left — every piece was fully migrated.

## Removed Code
| File | What was removed | Justification |
|------|-----------------|---------------|
| `FlinkSqlFiddleApplication.java` | `@SpringBootApplication` main + `@EventListener(ApplicationReadyEvent)` | Quarkus auto-generates the main class; startup logging moved to `StartupLogger` (`@Observes StartupEvent`). |
| `api/WebConfig.java` | `WebMvcConfigurer` CORS mapping | Replaced by `quarkus.http.cors.*` config. |
| `logback-spring.xml` | Spring Boot Logback config | Replaced by `quarkus.log.category.*` (Quarkus uses JBoss LogManager; this file would be silently ignored). |

## Behavior Notes / Runtime Risks
- **Uber-jar is required, not cosmetic.** Flink's embedded MiniCluster deserializes the
  job graph with the **system classloader**. Quarkus's default fast-jar layout hides
  dependency classes behind its `RunnerClassLoader`, producing
  `ClassNotFoundException: org.apache.flink.table.runtime.operators.CodeGenOperatorFactory`.
  `quarkus.package.jar.type=uber-jar` flattens everything onto the system classpath — the
  exact analog of the former Spring Boot image's `jarmode extract` step.
- **Build JVM must be JDK 25.** Quarkus augmentation runs in the Gradle JVM and loads the
  compiled (Java 25) classes; building on JDK 21 fails with `UnsupportedClassVersionError`.
  CI and both Dockerfiles now pin JDK 25.
- **Validation error payload** comes from `ConstraintViolationException` (not Spring's
  `MethodArgumentNotValidException`); status (400) and `code` (`VALIDATION_ERROR`) are
  preserved, message format uses the leaf field name.
- The defensive clamping in `FlinkProperties`/`ExecutionLimits` is **retained** (records
  kept; `@ConfigMapping` interfaces feed them through a producer).

## Checks That Failed Initially (and fixes)
1. `RestResponse.status(int, entity)` has no such overload → used
   `RestResponse.ResponseBuilder.<T>create(int).entity(...).build()` for 429/408 and the
   `WebApplicationException` passthrough.
2. `quarkusBuild` → `UnsupportedClassVersionError` (augmentation on JDK 21) → run Gradle on JDK 25.
3. Live query → `ClassNotFoundException` for a Flink operator factory → switched to uber-jar packaging.
4. Config warnings (`quarkus.http.cors`, deprecated `quarkus.hibernate-orm.database.generation`)
   → `quarkus.http.cors.enabled`, `quarkus.hibernate-orm.schema-management.strategy`.

## Skill Improvement Suggestions
- **Embedded compute engines need uber-jar.** Add guidance: apps embedding Flink/Spark/etc.
  that rely on the system classloader for (de)serialization should use
  `quarkus.package.jar.type=uber-jar`. This was the single biggest gotcha.
- **Augmentation JVM ≥ target bytecode.** The Gradle build module should note that Quarkus
  augmentation executes in the Gradle JVM, so the build must run on a JDK at least as new as
  the toolchain's target release (here Java 25), independent of the compile toolchain.
- **Jackson 3 → 2.** Spring Boot 4 ships Jackson 3 (`tools.jackson.databind`); Quarkus uses
  Jackson 2 (`com.fasterxml.jackson.databind`). Annotations (`com.fasterxml.jackson.annotation.*`)
  are shared and need no change — worth calling out to avoid confusion.
- **`@ConfigMapping` is interface-only.** The annotation map says records work; in practice
  `@ConfigMapping` targets interfaces. The "interface + CDI producer → domain record" pattern
  used here preserves existing record APIs and test-constructability and is worth documenting.
- **`ResponseBodyEmitter`/SSE → `Multi`.** No mapping is given for Spring's streaming response
  bodies; `Multi<T>` + `application/x-ndjson` (or SSE) is the native equivalent.
