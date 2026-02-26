## Context

The app uses an embedded Flink MiniCluster with `datagen` as the primary data source connector. The `datagen` connector is bundled with Flink and produces random numeric/string data. Users can only use connectors in the `ALLOWED_CONNECTORS` whitelist (`datagen`, `print`, `blackhole`).

The upstream [flink-faker](https://github.com/knaufk/flink-faker) project (Apache 2.0) provides a Flink SQL connector that generates realistic data via [DataFaker](https://github.com/datafaker-net/datafaker) expressions. Its latest release (v0.5.3) targets Flink 1.17.0, but there is an open [PR #127](https://github.com/knaufk/flink-faker/pull/127) that ports the code to Flink 2.0 + DataFaker 2.5.3. We use this PR as the reference for our port.

## Goals / Non-Goals

**Goals:**
- Users can create tables with `'connector' = 'faker'` and `'fields.<col>.expression' = '#{...}'`
- At least one new UI example demonstrates faker with realistic output (names, products, etc.)
- The ported code compiles and runs against Flink 2.2.0 + DataFaker 2.5.4

**Non-Goals:**
- Full feature parity with upstream flink-faker (lookup table source can be deferred)
- Replacing existing `datagen` examples — faker is additive
- Publishing the ported connector as a separate library

## Decisions

**Decision 1: Port source code using PR #127 as reference**

PR #127 on knaufk/flink-faker already adapts the code for Flink 2.0. The specific API changes are:

1. `FlinkFakerGenerator.open(Configuration)` → `open(OpenContext)` (import `org.apache.flink.api.common.functions.OpenContext`)
2. `getRuntimeContext().getNumberOfParallelSubtasks()` → `getRuntimeContext().getTaskInfo().getNumberOfParallelSubtasks()`
3. `getRuntimeContext().getIndexOfThisSubtask()` → `getRuntimeContext().getTaskInfo().getIndexOfThisSubtask()`
4. DataFaker upgraded from 1.9.0 to 2.5.x (same `net.datafaker` package, API compatible)

These are the only source-level changes needed. The `FlinkFakerTableSourceFactory` and `FlinkFakerTableSource` classes compile as-is against Flink 2.x.

*Alternative: depend on the upstream JAR* — v0.5.3 is compiled against Flink 1.17; PR #127 is unmerged and unreleased. Porting gives us immediate control.

**Decision 2: DataFaker 2.5.4 (latest stable)**

PR #127 uses DataFaker 2.5.3; we use 2.5.4 (latest patch). Same `net.datafaker.Faker` API, backward-compatible expression syntax.

**Decision 3: Package under `com.flinksqlfiddle.faker`**

Keep the ported code in our project namespace. The SPI factory registration in `META-INF/services/org.apache.flink.table.factories.Factory` points to our class.

**Decision 4: ScanTableSource only (defer LookupTableSource)**

The playground doesn't need lookup joins against faker tables. Omitting `FlinkFakerLookupFunction` cuts ~1 class. Can be added later if needed.

**Decision 5: One new faker example — "Realistic Orders (Faker)"**

A BATCH example with customers, products, and order amounts using faker expressions. BATCH mode avoids streaming timeout complexity and showcases the connector's value clearly.

```sql
CREATE TEMPORARY TABLE fake_orders (
    customer_name STRING,
    product STRING,
    amount DOUBLE,
    city STRING
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '50',
    'fields.customer_name.expression' = '#{Name.fullName}',
    'fields.product.expression' = '#{Commerce.productName}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}',
    'fields.city.expression' = '#{Address.city}'
);
```

## Risks / Trade-offs

- **[Flink 2.2 vs 2.0 delta]** → PR #127 targets Flink 2.0.0; we're on 2.2.0. The `OpenContext` and `TaskInfo` APIs are stable across 2.x. Low risk.
- **[DataFaker 2.x expression compatibility]** → Expression syntax (`#{...}`) is backward-compatible. Mitigation: test with the exact expressions used in examples.
- **[JAR size increase]** → DataFaker 2.5.4 adds ~3 MB. Acceptable for a playground app.
- **[Maintenance burden]** → We own the ported code. Mitigation: the connector is stable and small (~4 classes); upstream PR #127 can be tracked for any future changes.
