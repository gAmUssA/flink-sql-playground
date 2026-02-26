## 1. Dependencies

- [x] 1.1 Add `runtimeOnly("org.postgresql:postgresql")` to `build.gradle.kts`. Acceptance: `./gradlew dependencies` shows postgresql driver in runtimeClasspath.
- [x] 1.2 Add `implementation("org.flywaydb:flyway-core")` and `implementation("org.flywaydb:flyway-database-postgresql")` to `build.gradle.kts`. Acceptance: Flyway classes available on classpath.

## 2. Flyway Migration

- [x] 2.1 Create `src/main/resources/db/migration/V1__create_fiddles_table.sql` with `CREATE TABLE fiddles` matching the `Fiddle` entity columns (`short_code VARCHAR(8) PRIMARY KEY`, `schema_ddl TEXT NOT NULL`, `query TEXT NOT NULL`, `mode VARCHAR(20) NOT NULL`, `created_at TIMESTAMP NOT NULL`). Acceptance: migration file exists with valid SQL.
- [x] 2.2 Update `Fiddle.java` — add explicit `@Column(name = "short_code")`, `@Column(name = "schema_ddl")`, `@Column(name = "created_at")` annotations so Hibernate column names match the Flyway migration. Acceptance: column names in entity match migration DDL exactly.

## 3. Configuration

- [x] 3.1 Update `application.yaml` — change `spring.jpa.hibernate.ddl-auto` from `create` to `validate`. Acceptance: app starts with Flyway-managed schema and Hibernate validates it.
- [x] 3.2 Create `src/main/resources/application-supabase.yaml` with datasource configuration using `${SUPABASE_DB_URL}`, `${SUPABASE_DB_USER}`, `${SUPABASE_DB_PASSWORD}` environment variables, and `driver-class-name: org.postgresql.Driver`. Acceptance: file exists with env var placeholders.

## 4. Verification

- [x] 4.1 Run `./gradlew bootRun` (default H2 profile) — verify application starts, Flyway runs `V1__`, Hibernate validates schema, and fiddle save/load works. Acceptance: no startup errors, fiddle API responds.
- [x] 4.2 Run `./gradlew build` — verify compilation and any existing tests pass. Acceptance: BUILD SUCCESSFUL.

## 5. Deployment Documentation

- [x] 5.1 Update `DEPLOY.md` — document the `supabase` profile activation (`SPRING_PROFILES_ACTIVE=supabase`), required environment variables (`SUPABASE_DB_URL`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`), and Supabase connection string format. Acceptance: DEPLOY.md has a "Supabase" section with all env vars documented.
