## 1. Add DataFaker Dependency

- [x] 1.1 In `build.gradle.kts`, add `implementation("net.datafaker:datafaker:2.5.4")` to the dependencies block. Acceptance: `./gradlew compileJava` succeeds.

## 2. Port Faker Connector Source

- [x] 2.1 Create `src/main/java/com/flinksqlfiddle/faker/FlinkFakerTableSourceFactory.java` — port from upstream, adapt to Flink 2.2.0 `DynamicTableSourceFactory` API and DataFaker 2.x imports. Register connector identifier as `"faker"`. Acceptance: compiles against Flink 2.2.0.
- [x] 2.2 Create `src/main/java/com/flinksqlfiddle/faker/FlinkFakerTableSource.java` — port `ScanTableSource` implementation (omit `LookupTableSource`). Adapt `DataStreamScanProvider` and `NumberSequenceSource` to Flink 2.2.0 APIs. Acceptance: compiles.
- [x] 2.3 Create `src/main/java/com/flinksqlfiddle/faker/FlinkFakerGenerator.java` — port `RichFlatMapFunction<Long, RowData>` with DataFaker 2.x expression evaluation and rate limiting. Acceptance: compiles.
- [x] 2.4 Create `src/main/java/com/flinksqlfiddle/faker/FakerUtils.java` — port type conversion utility (`stringValueToType`). Adapt to Flink 2.2.0 `LogicalType` API. Acceptance: compiles.
- [x] 2.5 Create `src/main/resources/META-INF/services/org.apache.flink.table.factories.Factory` — register `com.flinksqlfiddle.faker.FlinkFakerTableSourceFactory`. Acceptance: Flink discovers the factory at runtime.

## 3. Whitelist Faker Connector

- [x] 3.1 In `SecurityConstants.java`, add `"faker"` to the `ALLOWED_CONNECTORS` set. Acceptance: `Set.of("datagen", "faker", "print", "blackhole")`.
- [x] 3.2 In `SqlSecurityValidatorTest.java`, add a test that the `faker` connector passes validation. Acceptance: `./gradlew test` passes.

## 4. Add Faker Example

- [x] 4.1 In `examples.js`, add a "Realistic Orders (Faker)" BATCH example using `'connector' = 'faker'` with expressions for customer name, product, amount, and city. Acceptance: example appears in UI dropdown.
- [x] 4.2 In `ExampleQueriesSmokeTest.java`, add a `fakerRealisticOrders()` smoke test that executes the faker example schema + query. Acceptance: `./gradlew test` passes with the new test.

## 5. Verify

- [x] 5.1 Run `./gradlew test` — all existing + new tests pass. Start the app and verify the faker example works from the UI. Acceptance: faker example returns rows with realistic names/products/cities.
