---
name: flink-sql
description: "Apache Flink SQL, Table API, and UDF development for both OSS
  Flink and Confluent Cloud. Use when: (1) Writing Flink SQL queries (windows,
  joins, aggregations, MATCH_RECOGNIZE), (2) Building Table API pipelines in
  Java or Python, (3) Creating UDFs (scalar, table functions) for Flink, (4)
  Deploying Flink jobs to Confluent Cloud, (5) Converting between DataStream and
  Table API, (6) Troubleshooting Flink SQL errors. Covers windowing, event-time
  processing, watermarks, state management, and Confluent-specific patterns."
---
# Apache Flink SQL & Table API

Stream processing with SQL semantics. Tables that change over time — think of them as **movies, not photographs**.

## Quick Reference

| Task | Approach |
|------|----------|
| Simple transformations | Flink SQL SELECT/WHERE/GROUP BY |
| Windowed aggregation | Window TVFs (TUMBLE/HOP/SESSION/CUMULATE) |
| Pattern detection | MATCH_RECOGNIZE |
| Custom scalar logic | UDF (ScalarFunction) |
| One-to-many expansion | UDTF (TableFunction) |
| Stateful processing | Process Table Function (PTF) — see [ptf-guide.md](references/ptf-guide.md) |
| Join streams | Interval joins, temporal joins, lookup joins |
| Deduplication | ROW_NUMBER() with OVER clause |
| Top-N queries | ROW_NUMBER() OVER (ORDER BY ...) |
| Row-to-row comparison | LAG/LEAD window functions |
| Late data routing | CURRENT_WATERMARK() + Statement Sets |
| Multi-level aggregation | Chained windows (fine → coarse) |

## Mental Model: Streams ↔ Tables

```
Traditional DB: Table = snapshot (photograph)
Flink:          Table = changelog (movie)

Every INSERT/UPDATE/DELETE is an event in the changelog.
SQL queries become continuous — results update as data arrives.
```

**Changelog modes:**
- **Insert-only**: Append-only streams (logs, events)
- **Upsert**: Updates keyed by primary key (CDC, aggregations)
- **Retract**: Full changelog with retractions

## Environment Setup

### Confluent Cloud (Recommended for managed)

**Java Table API:**
```xml
<dependency>
  <groupId>io.confluent.flink</groupId>
  <artifactId>confluent-flink-table-api-java-plugin</artifactId>
  <version>2.1-8</version>
</dependency>
```

```java
import io.confluent.flink.plugin.ConfluentSettings;
TableEnvironment env = TableEnvironment.create(
    ConfluentSettings.fromGlobalVariables()
);
```

**Python Table API:**
```bash
pip install confluent-flink-table-api-python-plugin
```

```python
from pyflink.table.confluent import ConfluentSettings
from pyflink.table import TableEnvironment
settings = ConfluentSettings.from_global_variables()
env = TableEnvironment.create(settings)
```

**Required environment variables:**
```bash
export CLOUD_PROVIDER="aws"
export CLOUD_REGION="us-east-1"
export FLINK_API_KEY="<key>"
export FLINK_API_SECRET="<secret>"
export ORG_ID="<org-id>"
export ENV_ID="<env-id>"
export COMPUTE_POOL_ID="<pool-id>"
```

### OSS Flink (Self-managed)

```java
EnvironmentSettings settings = EnvironmentSettings
    .newInstance()
    .inStreamingMode()
    .build();
TableEnvironment env = TableEnvironment.create(settings);
```

## Flink SQL Patterns

### Window Aggregations

**Tumbling window** (fixed, non-overlapping):
```sql
SELECT 
  window_start, window_end,
  COUNT(*) as cnt,
  SUM(amount) as total
FROM TABLE(
  TUMBLE(TABLE orders, DESCRIPTOR(event_time), INTERVAL '1' HOUR)
)
GROUP BY window_start, window_end;
```

**Hopping window** (overlapping):
```sql
SELECT window_start, window_end, AVG(price)
FROM TABLE(
  HOP(TABLE trades, DESCRIPTOR(ts), INTERVAL '5' MINUTE, INTERVAL '1' HOUR)
)
GROUP BY window_start, window_end;
```

**Session window** (gap-based):
```sql
SELECT window_start, window_end, user_id, COUNT(*)
FROM TABLE(
  SESSION(TABLE clicks, DESCRIPTOR(click_time), INTERVAL '30' MINUTE)
)
GROUP BY window_start, window_end, user_id;
```

### Joins

**Interval join** (time-bounded):
```sql
SELECT o.*, s.ship_time
FROM orders o, shipments s
WHERE o.order_id = s.order_id
  AND s.ship_time BETWEEN o.order_time AND o.order_time + INTERVAL '4' HOUR;
```

**Temporal join** (point-in-time lookup):
```sql
SELECT o.*, r.rate
FROM orders o
JOIN currency_rates FOR SYSTEM_TIME AS OF o.order_time AS r
ON o.currency = r.currency;
```

**Lookup join** (external table):
```sql
SELECT o.*, c.name
FROM orders o
JOIN customers FOR SYSTEM_TIME AS OF o.proc_time AS c
ON o.customer_id = c.id;
```

### Deduplication

```sql
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY event_time DESC) AS rn
  FROM events
)
WHERE rn = 1;
```

### Top-N

```sql
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY sales DESC) AS rn
  FROM products
)
WHERE rn <= 10;
```

### Pattern Detection (MATCH_RECOGNIZE)

```sql
SELECT *
FROM orders
MATCH_RECOGNIZE (
  PARTITION BY user_id
  ORDER BY event_time
  MEASURES
    FIRST(A.event_time) AS start_time,
    LAST(B.event_time) AS end_time,
    COUNT(A.amount) AS cnt
  ONE ROW PER MATCH
  PATTERN (A+ B)
  DEFINE
    A AS A.amount < 100,
    B AS B.amount >= 100
);
```

## Table API Patterns

### Basic Operations (Java)

```java
Table orders = env.from("orders");

Table result = orders
    .filter($("status").isEqual("completed"))
    .select($("order_id"), $("amount"), $("customer_id"))
    .groupBy($("customer_id"))
    .select($("customer_id"), $("amount").sum().as("total"));
```

### Mixing SQL and Table API

```java
// SQL → Table
Table fromSql = env.sqlQuery("SELECT * FROM orders WHERE amount > 100");

// Table → SQL
env.createTemporaryView("filtered_orders", fromSql);
Table fromTable = env.sqlQuery("SELECT customer_id, SUM(amount) FROM filtered_orders GROUP BY customer_id");
```

### Confluent-Specific: ConfluentTools

```java
// Print results (limited)
ConfluentTools.printMaterializedLimit(table, 100);

// Collect results
List<Row> rows = ConfluentTools.collectMaterializedLimit(table, 100);

// Statement lifecycle
TableResult result = env.executeSql("SELECT * FROM orders");
String statementName = ConfluentTools.getStatementName(result);
ConfluentTools.stopStatement(result);
```

### Confluent-Specific: ConfluentTableDescriptor

```java
TableDescriptor descriptor = ConfluentTableDescriptor.forManaged()
    .schema(Schema.newBuilder()
        .column("id", DataTypes.INT())
        .column("data", DataTypes.STRING())
        .watermark("$rowtime", $("$rowtime").minus(lit(5).seconds()))
        .build())
    .build();
env.createTable("my_table", descriptor);
```

## User-Defined Functions

For UDF development patterns, templates, and deployment: **See [udf-guide.md](references/udf-guide.md)**

### Quick UDF Example (Java)

```java
public class MyUpperCase extends ScalarFunction {
    public String eval(String s) {
        return s == null ? null : s.toUpperCase();
    }
}

// Register and use
env.createTemporaryFunction("my_upper", MyUpperCase.class);
env.sqlQuery("SELECT my_upper(name) FROM users");
```

### Confluent Cloud UDF Deployment

```bash
# Build JAR
mvn clean package

# Upload artifact
confluent flink artifact create my-udf \
  --cloud aws --region us-east-1 \
  --artifact-file target/my-udf-1.0.jar

# Register function
CREATE FUNCTION my_upper 
AS 'com.example.MyUpperCase' 
USING JAR 'confluent-artifact://cfa-xxxxx';
```

## Watermarks & Event Time

**Declare watermark in DDL:**
```sql
CREATE TABLE events (
  event_id STRING,
  event_time TIMESTAMP(3),
  payload STRING,
  WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (...);
```

**Watermark strategies:**
- `event_time - INTERVAL 'n' SECOND` — bounded out-of-orderness
- `event_time` — strictly ascending (no late data)
- `SOURCE_WATERMARK()` — preserve source watermarks

## Critical Rules

1. **Always declare watermarks** for event-time processing
2. **State TTL matters** — unbounded state = memory explosion
3. **Schema must match** — SQL expects explicit type declarations
4. **Know your changelog mode** — insert-only vs updating affects downstream
5. **Confluent Cloud limits:**
   - Max 10 UDFs per statement
   - Max 100 artifacts per environment
   - JDK 17 max for uploaded JARs
   - No aggregate UDFs (only scalar and table functions)
   - No MATCH_RECOGNIZE with UDFs

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot resolve watermark` | Missing watermark declaration | Add `WATERMARK FOR col AS ...` |
| `Schema mismatch` | Column types don't align | Check data types with `DESCRIBE table` |
| `State too large` | Unbounded aggregation | Add state TTL or use windows |
| `Late data dropped` | Watermark too aggressive | Increase watermark delay, or route late data with `CURRENT_WATERMARK()` (see sql-patterns.md) |
| `UDF not found` | Function not registered | Check catalog/database scope |

For detailed troubleshooting: **See [troubleshooting.md](references/troubleshooting.md)**

## Reference Files

- **[udf-guide.md](references/udf-guide.md)** — UDF development, templates, deployment
- **[sql-patterns.md](references/sql-patterns.md)** — Advanced SQL patterns and examples
- **[confluent-cloud.md](references/confluent-cloud.md)** — Confluent-specific features and CLI
- **[troubleshooting.md](references/troubleshooting.md)** — Common errors and solutions
- **[ptf-guide.md](references/ptf-guide.md)** — Process Table Functions (stateful operators)
- **[kafka-patterns.md](references/kafka-patterns.md)** — Kafka connector patterns, Avro/SR, Flink vs Kafka Streams
