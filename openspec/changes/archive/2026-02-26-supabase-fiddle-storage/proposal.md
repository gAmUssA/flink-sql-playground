## Why

Fiddles are currently stored in an in-memory H2 database that resets on every application restart. Shared fiddle URLs (e.g., `/f/a3b2c1`) break the moment the server restarts. Switching to Supabase (managed PostgreSQL) gives fiddles durable, persistent storage so shared links survive deployments. A Spring profile keeps H2 available for local development while Supabase handles production — as recommended in the blueprint's architecture section ("PostgreSQL / SQLite for fiddle metadata").

## What Changes

- Add PostgreSQL (Supabase) JDBC driver dependency to `build.gradle.kts`
- Create `application-supabase.yaml` Spring profile with Supabase datasource configuration (URL, credentials via environment variables)
- Refactor `application.yaml` so H2 stays as the default profile for local dev
- Add Flyway for schema migration management (replaces `ddl-auto: create`)
- Create initial Flyway migration (`V1__create_fiddles_table.sql`) matching the existing `Fiddle` entity
- Switch `ddl-auto` from `create` to `validate` so Flyway owns the schema
- Update deployment configuration (Dockerfile/`DEPLOY.md`) to activate the `supabase` profile and pass credentials

## Capabilities

### New Capabilities
- `supabase-profile`: Spring profile configuration for Supabase PostgreSQL connectivity, including datasource settings, credential management via environment variables, and Flyway migration support.

### Modified Capabilities
- `fiddle-storage`: The fiddle persistence layer gains Flyway-managed schema migrations and `ddl-auto: validate` instead of `create`. The JPA entity and repository remain unchanged — only the database lifecycle management changes.

## Impact

- **Dependencies**: adds `org.postgresql:postgresql` runtime dependency and `org.flywaydb:flyway-core` + `flyway-database-postgresql`
- **Configuration**: new `application-supabase.yaml` file; existing `application.yaml` updated for `ddl-auto: validate`
- **Deployment**: `DEPLOY.md` and Dockerfile updated to document `SPRING_PROFILES_ACTIVE=supabase` and required env vars (`SUPABASE_DB_URL`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`)
- **No code changes**: `Fiddle.java`, `FiddleRepository.java`, `FiddleService.java`, and `FiddleController.java` remain untouched
- **No breaking changes**: default profile stays H2 for local dev; existing behavior preserved
