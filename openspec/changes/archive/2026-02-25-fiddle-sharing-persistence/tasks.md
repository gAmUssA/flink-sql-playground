## 1. Dependencies

- [x] 1.1 Add `spring-boot-starter-data-jpa` and `com.h2database:h2` dependencies to `build.gradle.kts`. Acceptance: `./gradlew dependencies` shows both artifacts.

## 2. Configuration

- [x] 2.1 Add H2 datasource configuration to `application.yaml`: `spring.datasource.url=jdbc:h2:mem:fiddledb`, `spring.jpa.hibernate.ddl-auto=create`. Acceptance: H2 database starts with the application.

## 3. Entity and Repository

- [x] 3.1 Create `com.flinksqlfiddle.fiddle.Fiddle` JPA entity with `@Id shortCode` (String), `schema` (text/lob), `query` (text/lob), `mode` (String), `createdAt` (Instant). Acceptance: entity compiles with JPA annotations.
- [x] 3.2 Create `com.flinksqlfiddle.fiddle.FiddleRepository` extending `JpaRepository<Fiddle, String>`. Acceptance: repository is injectable.

## 4. Short Code Generation

- [x] 4.1 Create `com.flinksqlfiddle.fiddle.FiddleService` as a Spring `@Service` with a `save(schema, query, mode)` method that computes `SHA-256(schema + "|" + query + "|" + mode)`, takes first 8 hex chars as short code, checks for existing record, and persists if new. Acceptance: identical content returns the same short code.
- [x] 4.2 Implement `load(shortCode)` method returning `Optional<Fiddle>`. Acceptance: known codes return fiddle, unknown codes return empty.
