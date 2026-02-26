## ADDED Requirements

### Requirement: Fiddle JPA entity
The system SHALL have a `Fiddle` JPA entity with fields: `shortCode` (primary key), `schema` (DDL text), `query` (SQL text), `mode` (execution mode), and `createdAt` (timestamp).

#### Scenario: Entity persists to database
- **WHEN** a `Fiddle` entity is saved via the repository
- **THEN** it SHALL be retrievable by its `shortCode` primary key

### Requirement: Content-addressable short codes
The system SHALL generate short codes by computing `SHA-256(schema + "|" + query + "|" + mode)` and taking the first 8 hexadecimal characters.

#### Scenario: Identical content produces same short code
- **WHEN** two fiddles with identical schema, query, and mode are saved
- **THEN** they SHALL produce the same short code and the existing record SHALL be returned

#### Scenario: Different content produces different short codes
- **WHEN** two fiddles with different queries are saved
- **THEN** they SHALL produce different short codes

### Requirement: Save fiddle with deduplication
The `FiddleRepository` SHALL check if a short code already exists before inserting. If it exists, the existing fiddle SHALL be returned.

#### Scenario: New fiddle is saved
- **WHEN** a fiddle with a new short code is saved
- **THEN** the entity SHALL be persisted and the short code returned

#### Scenario: Duplicate fiddle returns existing
- **WHEN** a fiddle with content matching an existing record is saved
- **THEN** the existing short code SHALL be returned without creating a duplicate

### Requirement: Load fiddle by short code
The system SHALL retrieve a fiddle by its short code.

#### Scenario: Valid short code returns fiddle
- **WHEN** `findById(shortCode)` is called with a known code
- **THEN** the full fiddle content (schema, query, mode) SHALL be returned

#### Scenario: Unknown short code returns empty
- **WHEN** `findById(shortCode)` is called with an unknown code
- **THEN** an empty `Optional` SHALL be returned
