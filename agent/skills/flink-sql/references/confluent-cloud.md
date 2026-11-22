# Confluent Cloud for Apache Flink

Confluent-specific features, deployment patterns, and CLI commands.

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [CLI Commands](#cli-commands)
3. [Table API Plugin](#table-api-plugin)
4. [Confluent-Specific Features](#confluent-specific-features)
5. [Deployment Patterns](#deployment-patterns)
6. [Billing & Compute Pools](#billing--compute-pools)
7. [Limitations](#limitations)

## Setup & Configuration

### Prerequisites

1. Confluent Cloud account
2. Flink compute pool provisioned
3. Flink API key generated
4. Confluent CLI installed (`confluent update`)

### Environment Variables

```bash
# Required
export CLOUD_PROVIDER="aws"           # aws, azure, gcp
export CLOUD_REGION="us-east-1"       # region code
export ORG_ID="b0b421724-xxxx-xxxx"   # Organization ID
export ENV_ID="env-xxxxx"             # Environment ID
export COMPUTE_POOL_ID="lfcp-xxxxx"   # Compute pool ID
export FLINK_API_KEY="<key>"          # Flink API key
export FLINK_API_SECRET="<secret>"    # Flink API secret

# Optional (for UDF uploads)
export ARTIFACT_API_KEY="<key>"       # Cloud resource management key
export ARTIFACT_API_SECRET="<secret>"
```

### Generate Flink API Key

```bash
confluent flink api-key create \
  --environment $ENV_ID \
  --cloud $CLOUD_PROVIDER \
  --region $CLOUD_REGION
```

## CLI Commands

### Compute Pool Management

```bash
# List compute pools
confluent flink compute-pool list

# Create compute pool
confluent flink compute-pool create my-pool \
  --cloud aws \
  --region us-east-1 \
  --max-cfu 10

# Describe compute pool
confluent flink compute-pool describe lfcp-xxxxx

# Delete compute pool
confluent flink compute-pool delete lfcp-xxxxx

# Set default compute pool
confluent flink compute-pool use lfcp-xxxxx
```

### SQL Shell

```bash
# Start interactive SQL shell
confluent flink shell \
  --cloud $CLOUD_PROVIDER \
  --region $CLOUD_REGION \
  --environment $ENV_ID \
  --compute-pool $COMPUTE_POOL_ID

# In shell:
# > SHOW TABLES;
# > SELECT * FROM my_table LIMIT 10;
# > !quit
```

### Statement Management

```bash
# List statements
confluent flink statement list

# Create statement (run SQL)
confluent flink statement create my-statement \
  --sql "INSERT INTO sink_table SELECT * FROM source_table" \
  --compute-pool $COMPUTE_POOL_ID

# Describe statement
confluent flink statement describe my-statement

# Stop statement (pause)
confluent flink statement stop my-statement

# Resume statement
confluent flink statement resume my-statement

# Delete statement
confluent flink statement delete my-statement

# View exceptions
confluent flink statement exception list my-statement
```

### Artifact Management (UDFs)

```bash
# List artifacts
confluent flink artifact list

# Upload artifact
confluent flink artifact create my-udf \
  --cloud aws \
  --region us-east-1 \
  --artifact-file target/my-udf-1.0.jar

# Describe artifact
confluent flink artifact describe cfa-xxxxx

# Delete artifact
confluent flink artifact delete cfa-xxxxx
```

### Savepoint Management

```bash
# Create savepoint
confluent flink savepoint create \
  --statement my-statement

# List savepoints
confluent flink savepoint list

# Describe savepoint
confluent flink savepoint describe sp-xxxxx

# Resume from savepoint
confluent flink statement resume my-statement \
  --savepoint sp-xxxxx
```

## Table API Plugin

### Java Setup

**pom.xml:**
```xml
<repositories>
  <repository>
    <id>confluent</id>
    <url>https://packages.confluent.io/maven/</url>
  </repository>
</repositories>

<dependencies>
  <dependency>
    <groupId>org.apache.flink</groupId>
    <artifactId>flink-table-api-java</artifactId>
    <version>2.1.0</version>
  </dependency>
  <dependency>
    <groupId>io.confluent.flink</groupId>
    <artifactId>confluent-flink-table-api-java-plugin</artifactId>
    <version>2.1-8</version>
  </dependency>
</dependencies>
```

**Main class:**
```java
import io.confluent.flink.plugin.ConfluentSettings;
import io.confluent.flink.plugin.ConfluentTools;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;

public class FlinkApp {
    public static void main(String[] args) {
        // Create environment from env vars
        TableEnvironment env = TableEnvironment.create(
            ConfluentSettings.fromGlobalVariables()
        );
        
        // Execute SQL
        TableResult result = env.executeSql(
            "SELECT * FROM `cluster`.`database`.`topic`"
        );
        
        // Print results
        ConfluentTools.printMaterializedLimit(result, 100);
    }
}
```

### Python Setup

```bash
pip install confluent-flink-table-api-python-plugin
```

**Main script:**
```python
from pyflink.table.confluent import ConfluentSettings, ConfluentTools
from pyflink.table import TableEnvironment

# Create environment from env vars
settings = ConfluentSettings.from_global_variables()
env = TableEnvironment.create(settings)

# Execute SQL
result = env.execute_sql(
    "SELECT * FROM `cluster`.`database`.`topic`"
)

# Print results
ConfluentTools.print_materialized_limit(result, 100)
```

## Confluent-Specific Features

### System Columns

Confluent tables have special system columns:

| Column | Type | Description |
|--------|------|-------------|
| `$rowtime` | `TIMESTAMP_LTZ(3)` | Event time from Kafka timestamp |
| `$headers` | `MAP<STRING, BYTES>` | Kafka headers |

```sql
-- Use system columns
SELECT 
  id, 
  `$rowtime` as event_time,
  `$headers`['correlation-id'] as correlation_id
FROM my_topic;

-- Watermark on $rowtime
CREATE TABLE my_events (
  id STRING,
  payload STRING,
  WATERMARK FOR `$rowtime` AS `$rowtime` - INTERVAL '5' SECOND
);
```

### ConfluentTableDescriptor

```java
import io.confluent.flink.plugin.ConfluentTableDescriptor;

TableDescriptor descriptor = ConfluentTableDescriptor.forManaged()
    .schema(Schema.newBuilder()
        .column("id", DataTypes.STRING())
        .column("value", DataTypes.INT())
        .watermark("$rowtime", $("$rowtime").minus(lit(5).seconds()))
        .build())
    .build();

env.createTable("my_table", descriptor);
```

### ConfluentTools Utilities

```java
// Collect results (blocking)
List<Row> rows = ConfluentTools.collectMaterializedLimit(table, 100);
List<Row> allRows = ConfluentTools.collectMaterialized(table);  // Bounded only

// Print results
ConfluentTools.printMaterializedLimit(table, 100);
ConfluentTools.printMaterialized(table);  // Bounded only

// Statement lifecycle
TableResult result = env.executeSql("SELECT ...");
String name = ConfluentTools.getStatementName(result);
ConfluentTools.stopStatement(result);
ConfluentTools.stopStatementByName(env, "statement-name");
ConfluentTools.deleteStatement(env, "statement-name");
```

### Catalog Structure

```
<environment>
├── <kafka-cluster-1>
│   └── <database-1>
│       ├── topic_a
│       ├── topic_b
│       └── my_view
└── <kafka-cluster-2>
    └── <database-2>
        └── topic_c
```

```sql
-- Fully qualified name
SELECT * FROM `cluster_id`.`database_name`.`topic_name`;

-- Set default catalog/database
USE CATALOG `cluster_id`;
USE `database_name`;
SELECT * FROM topic_name;

-- Show structure
SHOW CATALOGS;
SHOW DATABASES;
SHOW TABLES;
```

## Deployment Patterns

### Continuous Streaming Job

```bash
# Create long-running statement
confluent flink statement create enrichment-job \
  --sql "INSERT INTO enriched_orders 
         SELECT o.*, c.name, c.tier 
         FROM orders o 
         JOIN customers FOR SYSTEM_TIME AS OF o.proc_time AS c 
         ON o.customer_id = c.id" \
  --compute-pool $COMPUTE_POOL_ID
```

### Savepoint-Based Updates

```bash
# 1. Stop with savepoint
confluent flink savepoint create --statement my-job

# 2. Update job (new SQL or schema)
confluent flink statement delete my-job
confluent flink statement create my-job-v2 \
  --sql "..." \
  --compute-pool $COMPUTE_POOL_ID

# 3. Resume from savepoint
confluent flink statement resume my-job-v2 --savepoint sp-xxxxx
```

### Blue-Green Deployment

```bash
# 1. Deploy new version alongside
confluent flink statement create job-v2 \
  --sql "INSERT INTO output_v2 SELECT ..." \
  --compute-pool $COMPUTE_POOL_ID

# 2. Verify new version
# 3. Stop old version
confluent flink statement stop job-v1

# 4. Switch consumers to new output
# 5. Delete old version
confluent flink statement delete job-v1
```

## Billing & Compute Pools

### CFU (Confluent Flink Unit)

- Billing is based on CFU consumption
- Each compute pool has max CFU limit
- Statements consume CFUs based on complexity

### Autopilot Mode

Confluent can automatically scale compute pools:

```bash
# Enable autopilot (in Console)
# Or set max-cfu higher and let system scale

confluent flink compute-pool create my-pool \
  --cloud aws \
  --region us-east-1 \
  --max-cfu 20  # System scales up to this
```

### Monitor CFU Usage

```bash
# Check statement metrics
confluent flink statement describe my-statement

# View in Console: Flink > Statements > Metrics
```

## Limitations

### General Limitations

| Feature | Status |
|---------|--------|
| DataStream API | Not supported (Table API only) |
| Batch mode | Not supported (streaming only) |
| Custom connectors | Not supported |
| State backends | Managed by Confluent |
| Checkpointing | Managed by Confluent |

### UDF Limitations

| Limitation | Value |
|------------|-------|
| Max UDFs per statement | 10 |
| Max artifacts per env | 100 |
| Max artifact size | 100 MB |
| Max row size | 4 MB |
| Java versions | 11, 17 |
| Python version | 3.11 only |

**Not supported:**
- Aggregate functions (UDAF)
- Table aggregate functions
- Temporary functions
- ALTER FUNCTION
- UDFs with MATCH_RECOGNIZE
- Vararg functions
- External network calls

### SQL Limitations

| Feature | Status |
|---------|--------|
| CREATE DATABASE | Not supported |
| CREATE CATALOG | Not supported |
| File connectors | Not supported |
| Classic JDBC lookup join (`FOR SYSTEM_TIME AS OF PROCTIME()`) | Not supported — use **External Tables / `KEY_SEARCH_AGG`** instead (below) |
| Hive integration | Not supported |
| `PROCTIME()` function | **Not supported** — see below |
| `CURRENT_TIMESTAMP` in update queries | Rejected as non-deterministic — see below |

### PROCTIME() is not supported

Confluent Cloud Flink rejects `PROCTIME()` with:
> `Function 'PROCTIME' is not supported in Confluent's Flink SQL dialect.`

This means the textbook lookup-join pattern doesn't work:

```sql
-- ❌ FAILS on Confluent Cloud
SELECT o.*, c.name
FROM orders o
LEFT JOIN customers FOR SYSTEM_TIME AS OF PROCTIME() AS c
  ON o.customer_id = c.id;
```

**Workarounds for "current-value lookup" semantics:**

1. **External Tables + `KEY_SEARCH_AGG`** — the canonical CC path for per-row lookups against an external database (Postgres/MySQL/SQL Server/Oracle), REST API, MongoDB, or Couchbase. See the "External Tables" section below. No proctime needed.
2. **Regular join against upsert-kafka** — if the reference data is already in a compacted Kafka topic, the upsert stream acts as a dynamic table and its current state is held in the join operator. Produces a changelog sink.
   ```sql
   SELECT o.*, c.name
   FROM orders o
   LEFT JOIN customers_upsert c  -- upsert-kafka
     ON o.customer_id = c.id;
   ```
3. **Event-time temporal join** — if the reference side has a watermark, use `FOR SYSTEM_TIME AS OF o.order_time` instead.
4. **System rowtime** — `FOR SYSTEM_TIME AS OF o.$rowtime` uses Kafka ingestion time (requires the right side to have a watermark declared).

### External Tables (Key Search)

Confluent Cloud Flink provides read-only **External Tables** for federated lookups against databases and REST APIs. This is the supported path for per-row enrichment from an external system — it replaces the OSS Flink JDBC/HBase lookup-join connectors.

**Supported connectors:**

| Connector        | `connector` option value | Dialects / backends                          |
|------------------|--------------------------|-----------------------------------------------|
| Confluent JDBC   | `confluent-jdbc`         | Postgres, MySQL, SQL Server, Oracle           |
| REST             | `rest`                   | Any HTTPS JSON endpoint                       |
| MongoDB          | `mongodb`                | MongoDB Atlas                                 |
| Couchbase        | `couchbase`              | Couchbase                                     |

**Three built-in TVFs** operate over external tables:
- `KEY_SEARCH_AGG(ext_table, DESCRIPTOR(key_col), search_col)` — exact-key lookup
- `TEXT_SEARCH_AGG(...)` — text / full-text search
- `VECTOR_SEARCH_AGG(...)` — vector / semantic search (requires an embedding)

**Two-step setup** — a `CREATE CONNECTION` (endpoint + credentials) then a `CREATE TABLE` that references it.

```sql
-- Step 1: connection (holds endpoint + credentials)
CREATE CONNECTION jdbc_postgres_connection
  WITH (
    'type' = 'confluent_jdbc',     -- NOTE: underscore form in CREATE CONNECTION
    'endpoint' = '<jdbc_url>',
    'username' = '<username>',
    'password' = '<password>',
    'environment' = '<ENV_ID>'
  );

-- Step 2: external table
CREATE TABLE netflix_shows (
    show_id STRING,
    title STRING,
    release_year INT,
    rating STRING
) WITH (
    'connector' = 'confluent-jdbc',           -- NOTE: hyphen form in CREATE TABLE
    'confluent-jdbc.connection' = 'jdbc_postgres_connection',
    'confluent-jdbc.table-name' = 'netflix_shows'
);
```

> **Naming gotcha:** connection type uses an underscore (`confluent_jdbc`), but the `CREATE TABLE` `connector` option uses a hyphen (`confluent-jdbc`). Both forms appear verbatim in the Confluent docs.

**Usage — `KEY_SEARCH_AGG` + `CROSS JOIN UNNEST`:**

The function returns an array column named `search_results`. Flatten it with `UNNEST`:

```sql
SELECT t.*
FROM input_titles,
LATERAL TABLE(KEY_SEARCH_AGG(netflix_shows, DESCRIPTOR(title), title))
CROSS JOIN UNNEST(search_results)
  AS t(show_id, title, release_year, rating);
```

**Tuning options** via the optional `map[...]` 4th argument:

```sql
LATERAL TABLE(KEY_SEARCH_AGG(
  netflix_shows, DESCRIPTOR(title), title,
  MAP['async_enabled', 'true',
      'client_timeout', '30',
      'max_parallelism', '10',
      'retry_count', '3']
))
```

| Option              | Default | Notes                                                                 |
|---------------------|---------|-----------------------------------------------------------------------|
| `async_enabled`     | `true`  | Non-blocking lookups                                                  |
| `client_timeout`    | `30`    | Seconds                                                               |
| `max_parallelism`   | `10`    | Only applies when `async_enabled = true`                              |
| `retry_count`       | `3`     |                                                                       |
| `retry_error_list`  | —       | Comma-separated error codes that trigger retry                        |
| `debug`             | `false` | Returns stack traces in `$errors` — may leak prompt/response content  |

**Limitations:**
- **Single-column key only.** No composite keys.
- **Output is an array.** Always follow with `CROSS JOIN UNNEST(search_results) AS t(...)`.
- **No documented cache / TTL knobs.** Unlike OSS JDBC lookup joins, there's no `lookup.cache.*` setting.
- **REST-specific:** HTTPS only, endpoint cannot be an IP, endpoint cannot be under `confluent.cloud`, auth header format is fixed.
- **No `PROCTIME()` needed** — the pattern uses `LATERAL TABLE(...)`, not `FOR SYSTEM_TIME AS OF`.

**Reference:** [Key Search with External Sources](https://docs.confluent.io/cloud/current/ai/external-tables/key-search.html)

### Regular joins against upsert streams produce changelog output

A regular JOIN between an append stream and an upsert-kafka table emits UPDATE/DELETE messages (not insert-only). If the sink is declared `'changelog.mode' = 'append'` the statement fails with:

> `Table sink '...' doesn't support consuming update and delete changes`

**Fix:** declare the sink as upsert with a PRIMARY KEY:

```sql
CREATE TABLE orders_enriched (
  order_id STRING NOT NULL,
  customer_name STRING,
  ...,
  PRIMARY KEY (order_id) NOT ENFORCED
) WITH (
  'changelog.mode' = 'upsert',    -- was 'append'
  ...
);
```

You'll also see two startup warnings that are mostly cosmetic:
- *"primary key does not match the upsert key"* — Flink adds a correction operator
- *"highly state-intensive operators without TTL"* — consider a state TTL if the reference side is large

### Non-deterministic functions rejected in update-producing queries

Any query that produces updates/deletes cannot include non-deterministic functions like `CURRENT_TIMESTAMP`, `NOW()`, `RAND()`:

> `The column(s) ... can not satisfy the determinism requirement for correctly processing update message`

**Why:** Flink may need to replay updates; if the function returns different values on replay, the output becomes inconsistent.

**Fixes:**
- Remove the non-deterministic column, or
- Carry the timestamp from the source row (e.g., use `o.order_time` instead of `CURRENT_TIMESTAMP`), or
- Keep the query insert-only (no upsert joins)

### Supported Regions

Check current availability:
```bash
confluent flink region list --cloud aws
confluent flink region list --cloud azure
confluent flink region list --cloud gcp
```

## Troubleshooting

### Connection Issues

```bash
# Verify credentials
confluent flink shell --debug

# Check API key scope
confluent api-key list --resource flink
```

### Statement Failures

```bash
# View exceptions
confluent flink statement exception list my-statement

# Check statement status
confluent flink statement describe my-statement
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Authentication failed` | Invalid API key | Regenerate Flink API key |
| `Compute pool not found` | Wrong pool ID | Check `confluent flink compute-pool list` |
| `Table not found` | Wrong catalog path | Use fully qualified name |
| `UDF not found` | Wrong artifact ID | Verify artifact uploaded |
| `CFU limit exceeded` | Pool at capacity | Increase max-cfu or add pool |
