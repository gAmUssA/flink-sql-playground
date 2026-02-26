## Context

Fiddles are stored via Spring Data JPA (`Fiddle` entity → `FiddleRepository`). The current datasource is an in-memory H2 database configured in `application.yaml` with `ddl-auto: create`. The schema is auto-generated from JPA annotations on every startup, meaning all data is lost on restart. The app runs on Koyeb with a Dockerfile. Supabase provides managed PostgreSQL with connection pooling (Transaction mode via Supavisor on port 6543).

## Goals / Non-Goals

**Goals:**
- Persistent fiddle storage via Supabase PostgreSQL in production
- H2 remains the default for local development (zero-config `./gradlew bootRun`)
- Flyway manages schema migrations (no more `ddl-auto: create`)
- Credentials injected via environment variables, never committed to source

**Non-Goals:**
- Migrating existing H2 data (in-memory, nothing to migrate)
- Connection pooling configuration (Supabase provides Supavisor)
- Row-level security or Supabase Auth integration
- Multi-tenant or user-scoped fiddle access
- Changing the `Fiddle` entity, repository, or service code

## Decisions

### 1. Spring profile name: `supabase`

Activate with `SPRING_PROFILES_ACTIVE=supabase`. The default (no profile) keeps H2 for local dev.

*Alternative considered*: `prod` or `postgres` — rejected because `supabase` is more specific and allows adding other PostgreSQL providers later without confusion.

### 2. Flyway for schema management

Replace `ddl-auto: create` with Flyway migrations + `ddl-auto: validate`.

- `V1__create_fiddles_table.sql` creates the `fiddles` table matching the existing `Fiddle` entity.
- Flyway runs on both profiles (H2 and Supabase) so the schema is consistent everywhere.
- `ddl-auto: validate` catches entity/schema drift at startup.

*Alternative considered*: keep `ddl-auto: update` — rejected because it's unsafe for production (can drop columns, no rollback).

### 3. Supabase direct connection (port 5432), not pooler

Use the direct connection string for the Spring Boot app. The pooler (port 6543, Transaction mode) breaks prepared statements with Hibernate. Since the fiddle app has low connection count (single instance, ~5 connections), the direct connection is appropriate.

*Alternative considered*: Supavisor pooler on port 6543 — rejected because Transaction mode resets prepared statement state between transactions, causing Hibernate errors.

### 4. Environment variables for credentials

```
SUPABASE_DB_URL=jdbc:postgresql://<host>:5432/postgres
SUPABASE_DB_USER=postgres.<project-ref>
SUPABASE_DB_PASSWORD=<password>
```

Referenced in `application-supabase.yaml` via `${SUPABASE_DB_URL}` etc.

*Alternative considered*: Supabase secrets vault or Spring Cloud Config — over-engineered for a single-service app.

### 5. Flyway migration location: classpath

Migrations in `src/main/resources/db/migration/` (Flyway default). Single location for both profiles — PostgreSQL and H2 both support standard SQL for this simple schema.

*Alternative considered*: separate `db/migration/h2` and `db/migration/postgresql` — rejected because the fiddles table uses only standard SQL types (`VARCHAR`, `TEXT`, `TIMESTAMP`).

## Risks / Trade-offs

**[Risk] Supabase free-tier connection limits (max 60)** → The app uses ~5 connections. Well within limits. Monitor via Supabase dashboard.

**[Risk] Supabase project pauses after 1 week inactivity on free tier** → Accept for now. Fiddle URLs will 500 if DB is paused. Mitigation: upgrade to Pro or add a health-check cron that touches the DB periodically.

**[Risk] H2 and PostgreSQL SQL dialect differences in migrations** → Mitigated by using only standard SQL in `V1`. If future migrations need dialect-specific SQL, split into `db/migration/h2` and `db/migration/postgresql` at that time.

**[Trade-off] `ddl-auto: validate` adds startup latency** → Negligible (~100ms). Worth it for schema safety.

## Migration Plan

1. Add dependencies (PostgreSQL driver, Flyway)
2. Create Flyway migration `V1__create_fiddles_table.sql`
3. Change `ddl-auto` from `create` to `validate` in `application.yaml`
4. Create `application-supabase.yaml` with `${SUPABASE_DB_*}` env vars
5. Test locally: `./gradlew bootRun` (H2, default) and `SPRING_PROFILES_ACTIVE=supabase ./gradlew bootRun` (Supabase)
6. Update `DEPLOY.md` and Dockerfile with env var documentation
7. Deploy to Koyeb with `SPRING_PROFILES_ACTIVE=supabase` and set env vars in Koyeb dashboard

**Rollback**: Remove `supabase` profile activation in Koyeb → app falls back to H2.
