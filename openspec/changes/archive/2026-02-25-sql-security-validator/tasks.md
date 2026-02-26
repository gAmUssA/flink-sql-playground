## 1. Security Constants

- [x] 1.1 Create `com.flinksqlfiddle.security.SecurityConstants` class with `MAX_ROWS = 1000`, `EXECUTION_TIMEOUT_SECONDS = 30`, `DEFAULT_PARALLELISM = 1`, and `ALLOWED_CONNECTORS = Set.of("datagen", "print", "blackhole")`. Acceptance: constants are accessible from other classes.

## 2. SQL Validator Implementation

- [x] 2.1 Create `com.flinksqlfiddle.security.SqlSecurityValidator` as a Spring `@Service`. Acceptance: class compiles and is picked up by component scan.
- [x] 2.2 Implement `validate(String sql)` method that parses SQL using regex-based pattern matching for statement type detection. Acceptance: valid SQL passes without error.
- [x] 2.3 Implement statement type blocking: reject `CREATE FUNCTION`, `SET`, `CREATE CATALOG`, and `ADD JAR` statement types by throwing `SecurityException`. Acceptance: `CREATE FUNCTION ...` throws SecurityException.
- [x] 2.4 Implement connector whitelisting: for `CREATE TABLE` statements, extract the `connector` property from the WITH clause and check against `ALLOWED_CONNECTORS`. Acceptance: `datagen` passes, `filesystem` and `jdbc` throw SecurityException.
- [x] 2.5 Implement multi-statement splitting: split input on semicolons, trim whitespace, skip empty strings, and validate each statement. Acceptance: `SELECT 1; SET 'k'='v'` throws SecurityException for the SET.

## 3. Allowlist Verification

- [x] 3.1 Verify that `SELECT`, `CREATE TABLE` (with whitelisted connector), `CREATE TEMPORARY VIEW`, `DROP TABLE`, `INSERT INTO ... SELECT`, and `EXPLAIN` all pass validation. Acceptance: no exceptions thrown for safe statements.
