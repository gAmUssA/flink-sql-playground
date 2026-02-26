## Why

Shareable URLs are a core feature of any SQL fiddle. Users need to save their DDL + query + mode as a short code and share it via URL. The system uses content-addressable storage (SHA-256 hash) so identical fiddles produce the same short code, enabling aggressive caching. References blueprint section: "Architecture — shareable link system."

## What Changes

- Create `Fiddle` JPA entity with short code, schema DDL, query SQL, execution mode, and timestamps
- Generate 8-character short codes from SHA-256 hash of content
- Configure H2 in-memory database (with option for SQLite) via Spring Data JPA
- Create `FiddleRepository` extending `JpaRepository`

## Capabilities

### New Capabilities
- `fiddle-storage`: JPA entity, content-addressable short codes, and repository for save/load operations

### Modified Capabilities

## Impact

- **Dependencies**: Adds `spring-boot-starter-data-jpa` and `h2` to `build.gradle.kts`
- **Code**: New `com.flinksqlfiddle.fiddle.Fiddle` entity and `FiddleRepository`
- **Database**: H2 in-memory database with auto-DDL for MVP; replaceable with SQLite for persistence
