## MODIFIED Requirements

### Requirement: Fiddle JPA entity
The system SHALL have a `Fiddle` JPA entity with fields: `shortCode` (primary key), `schema` (DDL text), `query` (SQL text), `mode` (execution mode), and `createdAt` (timestamp). Column mappings SHALL use explicit `@Column(name = ...)` annotations to match the Flyway-managed schema (`short_code`, `schema_ddl`, `query`, `mode`, `created_at`).

#### Scenario: Entity persists to database
- **WHEN** a `Fiddle` entity is saved via the repository
- **THEN** it SHALL be retrievable by its `shortCode` primary key

#### Scenario: Column names match Flyway migration
- **WHEN** the application starts with `ddl-auto: validate`
- **THEN** Hibernate SHALL successfully validate the `Fiddle` entity against the `fiddles` table without errors
