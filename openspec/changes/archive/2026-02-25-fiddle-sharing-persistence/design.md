## Context

SQL Fiddle's content-addressable model hashes DDL + query + mode into a short code. Identical content always produces the same URL, enabling caching and deduplication. For MVP, H2 in-memory database is simplest; SQLite provides optional persistence.

## Goals / Non-Goals

**Goals:**
- JPA entity for fiddle storage
- SHA-256-based short code generation (8 characters)
- Content deduplication (same content → same short code)
- Spring Data JPA repository for CRUD operations

**Non-Goals:**
- User accounts / ownership of fiddles
- Fiddle versioning or edit history
- Full-text search of fiddles
- Expiration of old fiddles (all persist for MVP)

## Decisions

### 1. H2 in-memory database for MVP
**Choice**: H2 with `spring.datasource.url=jdbc:h2:mem:fiddledb` and `spring.jpa.hibernate.ddl-auto=create`.
**Rationale**: Zero configuration, embedded, fast. Data is ephemeral (lost on restart) which is acceptable for MVP. Can switch to SQLite file-based for persistence.
**Alternatives**: SQLite via `spring.datasource.url=jdbc:sqlite:fiddles.db` — persistent but adds JDBC driver dependency.

### 2. SHA-256 with 8-character truncation for short codes
**Choice**: `SHA-256(schema + "|" + query + "|" + mode)`, take first 8 hex characters.
**Rationale**: 8 hex chars = 4 billion possible codes. Collision probability negligible at playground scale. Content-addressable means identical fiddles always produce the same URL.
**Alternatives**: UUID — not content-addressable, doesn't deduplicate. Base62 — slightly shorter URLs but more complex encoding.

### 3. JPA entity with @Table annotation
**Choice**: Standard JPA entity with `@Id` as the short code (not auto-generated).
**Rationale**: Short code is the natural primary key. Content-addressable design means we can use `findById` for both lookup and deduplication check.

## Risks / Trade-offs

- **[H2 data loss on restart]** → Expected for MVP. Document switch to SQLite for persistence.
- **[8-char collision]** → Extremely unlikely at playground scale (<100K fiddles). Can extend to 12 chars if needed.
