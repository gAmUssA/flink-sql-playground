## ADDED Requirements

### Requirement: Supabase Spring profile configuration
The system SHALL provide an `application-supabase.yaml` Spring profile that configures a PostgreSQL datasource connecting to Supabase. The profile SHALL be activated via `SPRING_PROFILES_ACTIVE=supabase`.

#### Scenario: Profile activates PostgreSQL datasource
- **WHEN** the application starts with `SPRING_PROFILES_ACTIVE=supabase`
- **THEN** the datasource SHALL connect to the PostgreSQL URL specified by the `SUPABASE_DB_URL` environment variable

#### Scenario: Default profile uses H2
- **WHEN** the application starts without any active profile
- **THEN** the datasource SHALL use the in-memory H2 database

### Requirement: Credentials via environment variables
The Supabase profile SHALL read database credentials from environment variables: `SUPABASE_DB_URL`, `SUPABASE_DB_USER`, and `SUPABASE_DB_PASSWORD`. Credentials SHALL NOT be committed to source control.

#### Scenario: Environment variables configure datasource
- **WHEN** the `supabase` profile is active and `SUPABASE_DB_URL`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` are set
- **THEN** the datasource SHALL use those values for connection URL, username, and password

#### Scenario: Missing credentials prevent startup
- **WHEN** the `supabase` profile is active and any required environment variable is missing
- **THEN** the application SHALL fail to start with a configuration error

### Requirement: PostgreSQL JDBC driver dependency
The project SHALL include the `org.postgresql:postgresql` runtime dependency so the PostgreSQL driver is available when the Supabase profile is active.

#### Scenario: PostgreSQL driver available at runtime
- **WHEN** the application starts with the `supabase` profile
- **THEN** the PostgreSQL JDBC driver SHALL be on the classpath and the connection SHALL succeed

### Requirement: Flyway schema migration support
The project SHALL include Flyway dependencies (`org.flywaydb:flyway-core` and `org.flywaydb:flyway-database-postgresql`) and an initial migration `V1__create_fiddles_table.sql` that creates the `fiddles` table.

#### Scenario: Flyway runs migration on startup
- **WHEN** the application starts with either H2 or Supabase profile
- **THEN** Flyway SHALL execute pending migrations from `db/migration/` before the application accepts requests

#### Scenario: Initial migration creates fiddles table
- **WHEN** `V1__create_fiddles_table.sql` runs on a fresh database
- **THEN** a `fiddles` table SHALL exist with columns `short_code` (VARCHAR primary key), `schema_ddl` (TEXT), `query` (TEXT), `mode` (VARCHAR), and `created_at` (TIMESTAMP)

### Requirement: Hibernate schema validation mode
The JPA configuration SHALL use `ddl-auto: validate` so Hibernate validates the entity mapping against the Flyway-managed schema at startup instead of creating or altering tables.

#### Scenario: Schema mismatch detected at startup
- **WHEN** the `Fiddle` entity does not match the database schema
- **THEN** the application SHALL fail to start with a validation error
