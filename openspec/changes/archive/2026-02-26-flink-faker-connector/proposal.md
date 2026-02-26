## Why

The `datagen` connector only produces random numbers and strings with min/max constraints — the generated data is unreadable (e.g., `page = "xK7qR"`). The [flink-faker](https://github.com/knaufk/flink-faker) connector wraps the [DataFaker](https://github.com/datafaker-net/datafaker) library and generates realistic-looking data using expressions like `#{Name.full_name}`, `#{Internet.url}`, `#{Commerce.product_name}`. This makes example query output immediately understandable and more compelling as a learning tool.

## What Changes

- Port flink-faker source code (~5 classes) into the project under `src/main/java/com/flinksqlfiddle/faker/`, adapted for Flink 2.2.0 APIs and using DataFaker 2.x
- Add `net.datafaker:datafaker:2.5.4` as a runtime dependency
- Register the `faker` connector via Flink's SPI (`META-INF/services/org.apache.flink.table.factories.Factory`)
- Whitelist `'faker'` in `ALLOWED_CONNECTORS` alongside `datagen`, `print`, `blackhole`
- Add 1–2 new example queries in `examples.js` that showcase the faker connector with realistic data
- Existing `datagen` examples remain unchanged — faker is additive

## Capabilities

### New Capabilities

- `faker-connector`: Faker connector integration — ported source, DataFaker dependency, security whitelist, SPI registration, and example queries

### Modified Capabilities

- `sql-validation`: Add `faker` to the connector whitelist requirement
- `example-queries`: Add faker-based examples to the curated set

## Impact

- **Dependency added**: `net.datafaker:datafaker:2.5.4` (Apache 2.0)
- **Source ported**: ~5 classes from [knaufk/flink-faker](https://github.com/knaufk/flink-faker) (Apache 2.0), adapted for Flink 2.2.0
- **Files modified**: `build.gradle.kts`, `SecurityConstants.java`, `examples.js`
- **Files created**: `src/main/java/com/flinksqlfiddle/faker/` (ported connector), `META-INF/services/` (SPI registration)
- **Tests updated**: `SqlSecurityValidatorTest.java` (whitelist test), `ExampleQueriesSmokeTest.java` (new example smoke tests)
