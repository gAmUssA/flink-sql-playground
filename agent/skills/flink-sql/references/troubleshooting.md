# Flink SQL Troubleshooting Guide

Common errors, causes, and solutions.

## Table of Contents

1. [Schema & Type Errors](#schema--type-errors)
2. [Watermark & Time Errors](#watermark--time-errors)
3. [State & Memory Errors](#state--memory-errors)
4. [Join Errors](#join-errors)
5. [UDF Errors](#udf-errors)
6. [Confluent Cloud Errors](#confluent-cloud-errors)
7. [Performance Issues](#performance-issues)

## Schema & Type Errors

### Error: Column not found

```
Column 'column_name' not found in table 'my_table'
```

**Causes:**
- Typo in column name
- Case sensitivity issues
- Column exists in different catalog/database

**Solutions:**
```sql
-- Check actual schema
DESCRIBE my_table;

-- Use backticks for special characters
SELECT `my-column` FROM my_table;

-- Fully qualify table name
SELECT * FROM `catalog`.`database`.`table`;
```

### Error: Type mismatch

```
Cannot apply '=' to arguments of type '<INT, STRING>'
```

**Causes:**
- Comparing incompatible types
- Implicit type conversion failed

**Solutions:**
```sql
-- Explicit cast
SELECT * FROM t WHERE CAST(id AS STRING) = '123';

-- Use correct type
SELECT * FROM t WHERE id = 123;
```

### Error: Ambiguous column reference

```
Column 'id' is ambiguous
```

**Causes:**
- Same column name in multiple joined tables

**Solutions:**
```sql
-- Use table alias
SELECT a.id, b.id FROM table_a a JOIN table_b b ON a.key = b.key;
```

### Error: Cannot resolve schema

```
Unable to create a source for reading table 'my_table'
```

**Causes:**
- Table doesn't exist
- Schema evolution issue
- Connector misconfiguration

**Solutions:**
```sql
-- Verify table exists
SHOW TABLES;

-- Check full path
SHOW TABLES IN `catalog`.`database`;

-- Recreate table with explicit schema
DROP TABLE IF EXISTS my_table;
CREATE TABLE my_table (...);
```

## Watermark & Time Errors

### Error: Cannot generate watermark

```
Cannot generate watermark for column 'event_time': column not found or not a timestamp
```

**Causes:**
- Column doesn't exist
- Column is not a timestamp type
- Watermark already defined

**Solutions:**
```sql
-- Check column type
DESCRIBE my_table;

-- Ensure timestamp type
CREATE TABLE events (
  id STRING,
  event_time TIMESTAMP(3),  -- Must be TIMESTAMP or TIMESTAMP_LTZ
  WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
);
```

### Error: Rowtime attribute required

```
An event-time attribute must be defined on input table
```

**Causes:**
- Using event-time operations without watermark
- Missing WATERMARK declaration

**Solutions:**
```sql
-- Add watermark
CREATE TABLE events (
  id STRING,
  event_time TIMESTAMP(3),
  WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
);

-- Or use processing time
CREATE TABLE events (
  id STRING,
  proc_time AS PROCTIME()
);
```

### Error: Late data discarded

**Symptoms:**
- Expected results not appearing
- Aggregations seem incomplete

**Causes:**
- Watermark too aggressive
- Out-of-order events exceed watermark delay

**Solutions:**
```sql
-- Increase watermark delay
WATERMARK FOR event_time AS event_time - INTERVAL '1' MINUTE;

-- Use processing time for non-time-critical operations
```

### Error: Window not firing

**Symptoms:**
- Window aggregations produce no output
- Results delayed indefinitely

**Causes:**
- Watermark not advancing
- No events after window end
- Idle partitions

**Solutions:**
```sql
-- Check watermark progress in logs

-- Add idle timeout (Kafka connector)
'properties.flink.partition-discovery.interval-millis' = '60000'

-- Use processing time for testing
SELECT * FROM TABLE(
  TUMBLE(TABLE events, DESCRIPTOR(PROCTIME()), INTERVAL '1' MINUTE)
);
```

## State & Memory Errors

### Error: State size exceeded

```
State size for key exceeds configured limit
```

**Causes:**
- Unbounded aggregation without TTL
- Too many distinct keys
- State not cleared

**Solutions:**
```sql
-- Add state TTL (in table config)
SET 'table.exec.state.ttl' = '24h';

-- Use windowed aggregation instead of unbounded
SELECT window_start, COUNT(*)
FROM TABLE(TUMBLE(TABLE events, DESCRIPTOR(ts), INTERVAL '1' HOUR))
GROUP BY window_start;

-- Add explicit deduplication with TTL
```

### Error: OutOfMemoryError

**Symptoms:**
- Job fails with OOM
- Task manager crashes

**Causes:**
- State too large
- Too many concurrent timers
- Memory leak in UDF

**Solutions:**
```bash
# Increase task manager memory
taskmanager.memory.process.size: 4096m

# Enable RocksDB for large state
state.backend: rocksdb
```

```sql
-- Reduce state with windows
-- Add TTL to configuration
SET 'table.exec.state.ttl' = '1h';
```

### Error: Checkpoint timeout

```
Checkpoint was declined (tasks not ready)
```

**Causes:**
- State too large to checkpoint
- Slow storage
- Backpressure

**Solutions:**
```bash
# Increase checkpoint timeout
execution.checkpointing.timeout: 10min

# Enable incremental checkpoints (RocksDB)
state.backend.incremental: true
```

## Join Errors

### Error: Join input must have watermark

```
Input of interval join must have watermark
```

**Causes:**
- Interval join requires event-time
- Missing watermark on one or both tables

**Solutions:**
```sql
-- Ensure both tables have watermarks
CREATE TABLE orders (
  id STRING,
  order_time TIMESTAMP(3),
  WATERMARK FOR order_time AS order_time - INTERVAL '5' SECOND
);

CREATE TABLE shipments (
  order_id STRING,
  ship_time TIMESTAMP(3),
  WATERMARK FOR ship_time AS ship_time - INTERVAL '5' SECOND
);
```

### Error: Unbounded state warning

```
WARNING: Join will result in unbounded state growth
```

**Causes:**
- Regular join without time bounds
- No state TTL configured

**Solutions:**
```sql
-- Use interval join
SELECT * FROM orders o, shipments s
WHERE o.id = s.order_id
  AND s.ship_time BETWEEN o.order_time AND o.order_time + INTERVAL '4' HOUR;

-- Or temporal join
SELECT * FROM orders o
JOIN dim_table FOR SYSTEM_TIME AS OF o.proc_time AS d
ON o.key = d.key;

-- Or configure TTL
SET 'table.exec.state.ttl' = '24h';
```

### Error: Lookup join requires processing time

```
Lookup join requires processing time attribute
```

**Causes:**
- Using event-time with lookup join
- Missing PROCTIME() column

**Solutions (OSS Flink):**
```sql
-- Add processing time column
CREATE TABLE orders (
  id STRING,
  customer_id STRING,
  proc_time AS PROCTIME()
);

-- Use in join
SELECT o.*, c.name
FROM orders o
JOIN customers FOR SYSTEM_TIME AS OF o.proc_time AS c
ON o.customer_id = c.id;
```

### Error: PROCTIME() not supported (Confluent Cloud)

```
Function 'PROCTIME' is not supported in Confluent's Flink SQL dialect.
```

**Cause:** Confluent Cloud Flink has no `PROCTIME()` function. The textbook temporal lookup-join syntax doesn't compile there.

**Solutions (pick the one that matches your data):**

```sql
-- Option 1 (CANONICAL): External Table + KEY_SEARCH_AGG
--   Use this when the reference data lives in a real external DB or REST API.
--   Requires CREATE CONNECTION + CREATE TABLE ... WITH ('connector' = 'confluent-jdbc',...)
SELECT o.order_id, t.name, t.tier
FROM orders o,
LATERAL TABLE(KEY_SEARCH_AGG(customers_ext, DESCRIPTOR(customer_id), customer_id))
CROSS JOIN UNNEST(search_results) AS t(customer_id, name, tier);

-- Option 2: Regular join against upsert-kafka reference table
--   Use this when the reference data is already in a compacted Kafka topic.
--   Emits a changelog stream, so sink must be upsert + PK.
SELECT o.*, c.name
FROM orders o
LEFT JOIN customers_ref c   -- upsert-kafka, compacted
  ON o.customer_id = c.id;

-- Option 3: Event-time temporal join (if versioning is what you actually want)
SELECT o.*, c.name
FROM orders o
JOIN customers_cdc FOR SYSTEM_TIME AS OF o.order_time AS c
  ON o.customer_id = c.id;
```

See [confluent-cloud.md — External Tables](confluent-cloud.md#external-tables-key-search) for the full `KEY_SEARCH_AGG` reference and the upsert-kafka workaround.

### Error: Sink doesn't support update/delete changes

```
Table sink '...' doesn't support consuming update and delete changes
which is produced by node Join(joinType=[LeftOuterJoin], ...)
```

**Cause:** A regular JOIN against an upsert-kafka (or other upsert) table emits update/delete rows, but the sink was declared with `changelog.mode = 'append'`.

**Solution:** make the sink upsert-capable with a `PRIMARY KEY`:

```sql
CREATE TABLE orders_enriched (
  order_id STRING NOT NULL,
  customer_name STRING,
  ...,
  PRIMARY KEY (order_id) NOT ENFORCED
) WITH (
  'changelog.mode' = 'upsert',   -- was 'append'
  ...
);
```

**Alternative:** switch to an event-time temporal join (`FOR SYSTEM_TIME AS OF o.event_time`) which produces insert-only output and can write to an append sink.

### Error: Non-deterministic column in update-producing query

```
The column(s): enriched_at (generated by non-deterministic function:
CURRENT_TIMESTAMP) can not satisfy the determinism requirement for
correctly processing update message ('UB'/'UA'/'D' in changelogMode,
not 'I' only)
```

**Cause:** Flink may need to replay updates (e.g., to handle retractions). If the query includes a non-deterministic function (`CURRENT_TIMESTAMP`, `NOW()`, `RAND()`, `UUID()`), the replayed value would differ from the original — breaking correctness.

**Common trigger:** adding a "processed at" timestamp column to a join with an upsert table.

**Solutions:**
```sql
-- ❌ Fails when the query produces updates
SELECT o.*, c.name, CURRENT_TIMESTAMP AS enriched_at
FROM orders o LEFT JOIN customers_upsert c ON o.cid = c.id;

-- ✅ Fix 1: drop the non-deterministic column
SELECT o.*, c.name
FROM orders o LEFT JOIN customers_upsert c ON o.cid = c.id;

-- ✅ Fix 2: carry a deterministic timestamp from the source
SELECT o.*, c.name, o.order_time AS enriched_at
FROM orders o LEFT JOIN customers_upsert c ON o.cid = c.id;

-- ✅ Fix 3: use an insert-only join (temporal join) — no updates to replay
SELECT o.*, c.name, CURRENT_TIMESTAMP AS enriched_at
FROM orders o
JOIN customers_cdc FOR SYSTEM_TIME AS OF o.order_time AS c
  ON o.cid = c.id;
```

## UDF Errors

### Error: Function not found

```
Function 'my_function' not found
```

**Causes:**
- Function not registered
- Wrong catalog/database scope
- Typo in function name

**Solutions:**
```sql
-- Check registered functions
SHOW FUNCTIONS;

-- Register function
CREATE FUNCTION my_function AS 'com.example.MyFunction';

-- Use correct scope
CREATE TEMPORARY FUNCTION my_function AS 'com.example.MyFunction';
```

### Error: Method not found

```
No matching method 'eval' found for class 'MyFunction'
```

**Causes:**
- Missing `eval` method
- Incompatible parameter types
- Method not public

**Solutions:**
```java
public class MyFunction extends ScalarFunction {
    // Must be public and named 'eval'
    public String eval(String input) {
        return input.toUpperCase();
    }
}
```

### Error: UDF throws exception

```
User-defined function threw exception: NullPointerException
```

**Causes:**
- Null input not handled
- Runtime exception in UDF

**Solutions:**
```java
public String eval(String input) {
    // Handle null
    if (input == null) {
        return null;
    }
    return input.toUpperCase();
}
```

## Confluent Cloud Errors

### Error: Authentication failed

```
401 Unauthorized: Invalid API key
```

**Causes:**
- Wrong API key/secret
- API key revoked or expired
- Wrong key type (need Flink key, not Kafka key)

**Solutions:**
```bash
# Generate new Flink API key
confluent flink api-key create \
  --environment $ENV_ID \
  --cloud $CLOUD_PROVIDER \
  --region $CLOUD_REGION

# Verify environment variables
echo $FLINK_API_KEY
echo $FLINK_API_SECRET
```

### Error: Compute pool not found

```
Compute pool 'lfcp-xxxxx' not found
```

**Causes:**
- Wrong pool ID
- Pool in different environment
- Pool deleted

**Solutions:**
```bash
# List available pools
confluent flink compute-pool list

# Verify environment
confluent environment list
confluent environment use $ENV_ID
```

### Error: Table not found (Confluent)

```
Table 'topic_name' not found
```

**Causes:**
- Topic doesn't exist
- Wrong catalog path
- No schema in Schema Registry

**Solutions:**
```sql
-- Use fully qualified name
SELECT * FROM `cluster_id`.`database_name`.`topic_name`;

-- Check available tables
SHOW CATALOGS;
SHOW DATABASES IN `cluster_id`;
SHOW TABLES IN `cluster_id`.`database_name`;
```

### Error: UDF artifact not found

```
Artifact 'cfa-xxxxx' not found
```

**Causes:**
- Wrong artifact ID
- Artifact in different region
- Artifact deleted

**Solutions:**
```bash
# List artifacts
confluent flink artifact list

# Upload artifact
confluent flink artifact create my-udf \
  --cloud aws --region us-east-1 \
  --artifact-file target/my-udf.jar
```

### Error: CFU limit exceeded

```
Statement cannot be scheduled: compute pool CFU limit exceeded
```

**Causes:**
- Pool at capacity
- Too many statements

**Solutions:**
```bash
# Check pool usage
confluent flink compute-pool describe $COMPUTE_POOL_ID

# Stop unused statements
confluent flink statement list
confluent flink statement stop unused-statement

# Create larger pool
confluent flink compute-pool create large-pool \
  --cloud aws --region us-east-1 --max-cfu 20
```

## Performance Issues

### High Latency

**Symptoms:**
- Results delayed
- Backpressure warnings

**Causes:**
- Complex queries
- Large state
- Insufficient resources

**Solutions:**
```sql
-- Simplify query
-- Use more efficient joins
-- Add indexes (lookup tables)
-- Increase parallelism
SET 'parallelism.default' = '8';
```

### Low Throughput

**Symptoms:**
- Processing slower than expected
- Consumer lag increasing

**Causes:**
- Serialization overhead
- Network bottleneck
- UDF inefficiency

**Solutions:**
```sql
-- Use projection pushdown
SELECT needed_column FROM large_table;

-- Avoid SELECT *
-- Pre-aggregate before joining
-- Optimize UDFs (batch processing)
```

### Skewed Data

**Symptoms:**
- Some tasks much slower
- Uneven parallelism

**Causes:**
- Hot keys
- Uneven partitioning

**Solutions:**
```sql
-- Add salting for hot keys
SELECT 
  CONCAT(key, '-', CAST(FLOOR(RAND() * 10) AS STRING)) as salted_key,
  value
FROM events;

-- Re-partition
-- Use local aggregation before global
```

## Debugging Tips

### Enable Debug Logging

```bash
# Set log level
log4j.rootLogger=DEBUG, console
```

### Explain Query Plan

```sql
EXPLAIN SELECT * FROM orders WHERE amount > 100;
EXPLAIN PLAN FOR INSERT INTO output SELECT * FROM input;
```

### Check Watermark Progress

Monitor watermark in Flink UI or logs to understand event-time progression.

### Validate SQL Syntax

```sql
-- Use EXPLAIN to validate without executing
EXPLAIN SELECT * FROM my_complex_query;
```
