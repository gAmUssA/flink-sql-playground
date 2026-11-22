# Flink SQL Patterns Reference

Advanced SQL patterns for stream processing.

## Table of Contents

1. [DDL Patterns](#ddl-patterns)
2. [Window Patterns](#window-patterns)
3. [Join Patterns](#join-patterns)
4. [Aggregation Patterns](#aggregation-patterns)
5. [CDC Patterns](#cdc-patterns)
6. [Advanced Queries](#advanced-queries)

## DDL Patterns

### Create Table with Kafka Connector

```sql
CREATE TABLE orders (
  order_id STRING,
  customer_id STRING,
  amount DECIMAL(10, 2),
  order_time TIMESTAMP(3),
  -- Metadata columns
  `partition` INT METADATA FROM 'partition' VIRTUAL,
  `offset` BIGINT METADATA FROM 'offset' VIRTUAL,
  -- Watermark
  WATERMARK FOR order_time AS order_time - INTERVAL '5' SECOND,
  -- Primary key for upsert mode
  PRIMARY KEY (order_id) NOT ENFORCED
) WITH (
  'connector' = 'kafka',
  'topic' = 'orders',
  'properties.bootstrap.servers' = 'localhost:9092',
  'properties.group.id' = 'flink-consumer',
  'scan.startup.mode' = 'earliest-offset',
  'format' = 'json',
  'json.timestamp-format.standard' = 'ISO-8601'
);
```

### Confluent Cloud Table (Managed)

```sql
-- Tables created from Kafka topics are auto-discovered
-- Just reference them:
SELECT * FROM `cluster`.`database`.`topic_name`;

-- Or create explicitly with specific schema
CREATE TABLE my_events (
  event_id STRING,
  event_type STRING,
  payload STRING,
  event_time TIMESTAMP_LTZ(3),
  WATERMARK FOR event_time AS event_time - INTERVAL '10' SECOND
);
```

### Create View

```sql
-- Simple view
CREATE VIEW high_value_orders AS
SELECT * FROM orders WHERE amount > 1000;

-- Materialized aggregation (continuous query)
CREATE VIEW customer_totals AS
SELECT 
  customer_id,
  COUNT(*) as order_count,
  SUM(amount) as total_amount
FROM orders
GROUP BY customer_id;
```

## Window Patterns

### Tumbling Window with Multiple Aggregations

```sql
SELECT 
  window_start,
  window_end,
  product_id,
  COUNT(*) as sale_count,
  SUM(quantity) as total_quantity,
  AVG(price) as avg_price,
  MIN(price) as min_price,
  MAX(price) as max_price
FROM TABLE(
  TUMBLE(TABLE sales, DESCRIPTOR(sale_time), INTERVAL '1' HOUR)
)
GROUP BY window_start, window_end, product_id;
```

### Hopping Window for Rolling Metrics

```sql
-- 5-minute slides over 1-hour windows
SELECT 
  window_start,
  window_end,
  sensor_id,
  AVG(temperature) as avg_temp,
  COUNT(*) as reading_count
FROM TABLE(
  HOP(
    TABLE sensor_readings, 
    DESCRIPTOR(reading_time), 
    INTERVAL '5' MINUTE,   -- slide
    INTERVAL '1' HOUR      -- size
  )
)
GROUP BY window_start, window_end, sensor_id;
```

### Session Window for User Activity

```sql
SELECT 
  window_start,
  window_end,
  user_id,
  COUNT(*) as action_count,
  LISTAGG(action_type, ', ') as actions
FROM TABLE(
  SESSION(TABLE user_actions, DESCRIPTOR(action_time), INTERVAL '30' MINUTE)
)
GROUP BY window_start, window_end, user_id;
```

### Cumulating Window for Running Totals

```sql
-- Daily cumulative with hourly updates
SELECT 
  window_start,
  window_end,
  SUM(revenue) as cumulative_revenue
FROM TABLE(
  CUMULATE(
    TABLE transactions,
    DESCRIPTOR(transaction_time),
    INTERVAL '1' HOUR,  -- step
    INTERVAL '1' DAY    -- max size
  )
)
GROUP BY window_start, window_end;
```

### Window with Late Data Handling

```sql
-- Watermark allows 5 seconds late data
CREATE TABLE events (
  event_id STRING,
  event_time TIMESTAMP(3),
  WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (...);

-- Late events (beyond watermark) are dropped from window results
```

### Chained Windows (Multi-Level Aggregation)

Feed fine-grained window results into a coarser window to reduce computation:

```sql
-- Step 1: 1-minute pre-aggregation
CREATE VIEW minute_stats AS
SELECT
  window_start,
  window_end,
  sensor_id,
  AVG(temperature) as avg_temp,
  COUNT(*) as reading_count
FROM TABLE(TUMBLE(TABLE sensor_readings, DESCRIPTOR(reading_time), INTERVAL '1' MINUTE))
GROUP BY window_start, window_end, sensor_id;

-- Step 2: 5-minute aggregation from pre-aggregated results
SELECT
  window_start,
  window_end,
  sensor_id,
  AVG(avg_temp) as avg_temp_5m,
  SUM(reading_count) as total_readings_5m
FROM TABLE(TUMBLE(TABLE minute_stats, DESCRIPTOR(window_end), INTERVAL '5' MINUTE))
GROUP BY window_start, window_end, sensor_id;
```

> **Tip:** Chaining reduces the number of rows the coarser window processes. Especially useful when the fine-grained window has high cardinality.

## Join Patterns

### Regular Join (Unbounded State Warning!)

```sql
-- CAUTION: State grows unboundedly
SELECT o.*, c.name
FROM orders o
JOIN customers c ON o.customer_id = c.id;
```

### Interval Join (Time-Bounded)

```sql
-- Orders joined with shipments within 4 hours
SELECT 
  o.order_id,
  o.order_time,
  s.ship_time,
  TIMESTAMPDIFF(MINUTE, o.order_time, s.ship_time) as minutes_to_ship
FROM orders o, shipments s
WHERE o.order_id = s.order_id
  AND s.ship_time BETWEEN o.order_time AND o.order_time + INTERVAL '4' HOUR;
```

### Temporal Join (Versioned Table)

```sql
-- Join orders with exchange rates at order time
SELECT 
  o.order_id,
  o.amount,
  o.currency,
  r.rate,
  o.amount * r.rate as amount_usd
FROM orders o
JOIN currency_rates FOR SYSTEM_TIME AS OF o.order_time AS r
ON o.currency = r.currency;
```

### Lookup Join (External Dimension)

```sql
-- Enrich with customer data from external DB (OSS Flink)
SELECT o.*, c.name, c.email
FROM orders o
JOIN customers FOR SYSTEM_TIME AS OF o.proc_time AS c
ON o.customer_id = c.id;
```

> **⚠️ Confluent Cloud:** `PROCTIME()` is **not supported**. For per-row lookups on CC, pick one of these patterns:
>
> **A. External Tables + `KEY_SEARCH_AGG`** (canonical path for real external DB / REST API lookups — supports Postgres, MySQL, SQL Server, Oracle, REST, MongoDB, Couchbase):
> ```sql
> SELECT o.order_id, t.name, t.tier
> FROM orders o,
> LATERAL TABLE(KEY_SEARCH_AGG(customers_ext, DESCRIPTOR(customer_id), customer_id))
> CROSS JOIN UNNEST(search_results) AS t(customer_id, name, tier);
> ```
> Requires a prior `CREATE CONNECTION` and a `CREATE TABLE ... WITH ('connector' = 'confluent-jdbc', ...)`. See [confluent-cloud.md — External Tables](confluent-cloud.md#external-tables-key-search).
>
> **B. Regular join against upsert-kafka** (when the reference data is already in a compacted Kafka topic):
> ```sql
> SELECT o.*, c.name
> FROM orders o
> LEFT JOIN customers_ref c   -- compacted upsert-kafka
>   ON o.customer_id = c.id;
> ```
> This produces a changelog stream, so **the sink must be `changelog.mode = 'upsert'` with a `PRIMARY KEY`**, and the query **cannot** include `CURRENT_TIMESTAMP` or other non-deterministic functions.

### Window Join

```sql
-- Join two windowed streams
SELECT 
  L.window_start,
  L.window_end,
  L.key,
  L.left_value,
  R.right_value
FROM (
  SELECT window_start, window_end, key, SUM(value) as left_value
  FROM TABLE(TUMBLE(TABLE left_stream, DESCRIPTOR(ts), INTERVAL '1' HOUR))
  GROUP BY window_start, window_end, key
) L
JOIN (
  SELECT window_start, window_end, key, SUM(value) as right_value
  FROM TABLE(TUMBLE(TABLE right_stream, DESCRIPTOR(ts), INTERVAL '1' HOUR))
  GROUP BY window_start, window_end, key
) R
ON L.key = R.key AND L.window_start = R.window_start;
```

### Star Schema (N-Way Temporal Joins)

Enrich a fact stream with multiple dimension tables in a single query:

```sql
-- Denormalize train activities with station, passenger, and channel dimensions
SELECT
  a.activity_id,
  a.activity_time,
  s.station_name,
  s.city,
  p.passenger_name,
  c.channel_type
FROM train_activities a
JOIN stations FOR SYSTEM_TIME AS OF a.activity_time AS s
  ON a.station_id = s.station_id
JOIN passengers FOR SYSTEM_TIME AS OF a.activity_time AS p
  ON a.passenger_id = p.passenger_id
JOIN booking_channels FOR SYSTEM_TIME AS OF a.activity_time AS c
  ON a.channel_id = c.channel_id;
```

> **Warning:** Each temporal join adds state. Monitor state size when joining many dimensions.

### Lateral Join (Correlated Subquery)

Evaluate a correlated subquery per input row with automatic retraction on updates. Note: this is distinct from `LATERAL TABLE(udtf())` used for table function expansion (see udf-guide.md).

```sql
-- For each state, find top 2 cities by population (updates as population changes)
SELECT
  s.state,
  c.city,
  c.population
FROM states s,
LATERAL (
  SELECT city, population
  FROM cities
  WHERE cities.state_id = s.state_id
  ORDER BY population DESC
  LIMIT 2
) AS c;
```

## Aggregation Patterns

### Group Aggregation with HAVING

```sql
SELECT 
  customer_id,
  COUNT(*) as order_count,
  SUM(amount) as total_amount
FROM orders
GROUP BY customer_id
HAVING SUM(amount) > 10000;
```

### Distinct Aggregation

```sql
SELECT 
  category,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) as total_events
FROM page_views
GROUP BY category;
```

### OVER Aggregation (Running Totals)

```sql
SELECT 
  order_id,
  customer_id,
  amount,
  SUM(amount) OVER (
    PARTITION BY customer_id 
    ORDER BY order_time
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) as running_total
FROM orders;
```

### OVER with Time Range

```sql
SELECT 
  event_id,
  user_id,
  COUNT(*) OVER (
    PARTITION BY user_id 
    ORDER BY event_time
    RANGE BETWEEN INTERVAL '1' HOUR PRECEDING AND CURRENT ROW
  ) as events_last_hour
FROM events;
```

### OVER with Statistical Functions (Outlier Detection)

```sql
-- Flag readings more than 2 standard deviations from rolling average
SELECT
  sensor_id,
  reading_time,
  temperature,
  avg_temp,
  stddev_temp,
  CASE 
    WHEN ABS(temperature - avg_temp) > 2 * stddev_temp THEN 'OUTLIER'
    ELSE 'NORMAL'
  END AS status
FROM (
  SELECT
    sensor_id,
    reading_time,
    temperature,
    AVG(temperature) OVER w AS avg_temp,
    STDDEV(temperature) OVER w AS stddev_temp
  FROM sensor_readings
  WINDOW w AS (
    PARTITION BY sensor_id
    ORDER BY reading_time
    RANGE BETWEEN INTERVAL '1' HOUR PRECEDING AND CURRENT ROW
  )
);
```

### LAG/LEAD Window Functions

Row-to-row comparison for trend detection. Note: `LAG` here is a standard window function — distinct from `LAG()` inside MATCH_RECOGNIZE DEFINE clauses (see Pattern Detection section).

```sql
-- Detect price movement direction
SELECT
  product_id,
  event_time,
  price,
  LAG(price) OVER (PARTITION BY product_id ORDER BY event_time) AS prev_price,
  CASE
    WHEN price > LAG(price) OVER (PARTITION BY product_id ORDER BY event_time) THEN '▲'
    WHEN price < LAG(price) OVER (PARTITION BY product_id ORDER BY event_time) THEN '▼'
    ELSE '='
  END AS trend
FROM price_updates;
```

### Streaming ORDER BY Constraints

In streaming mode, standalone `ORDER BY` requires a **time attribute** — Flink cannot sort an unbounded stream arbitrarily.

```sql
-- ✅ Valid: ORDER BY time attribute
SELECT * FROM events ORDER BY event_time;

-- ✅ Valid: ORDER BY with LIMIT (bounded result)
SELECT * FROM events ORDER BY amount DESC LIMIT 10;

-- ❌ Invalid in streaming: ORDER BY non-time column without LIMIT
-- SELECT * FROM events ORDER BY amount;  -- fails
```

## CDC Patterns

### Handling Debezium CDC

```sql
CREATE TABLE cdc_customers (
  id INT,
  name STRING,
  email STRING,
  updated_at TIMESTAMP(3),
  PRIMARY KEY (id) NOT ENFORCED
) WITH (
  'connector' = 'kafka',
  'topic' = 'dbserver1.inventory.customers',
  'properties.bootstrap.servers' = 'localhost:9092',
  'format' = 'debezium-json'
);
```

### Upsert to Kafka

```sql
CREATE TABLE customer_summary (
  customer_id STRING,
  order_count BIGINT,
  total_amount DECIMAL(10, 2),
  PRIMARY KEY (customer_id) NOT ENFORCED
) WITH (
  'connector' = 'upsert-kafka',
  'topic' = 'customer-summary',
  'properties.bootstrap.servers' = 'localhost:9092',
  'key.format' = 'json',
  'value.format' = 'json'
);

INSERT INTO customer_summary
SELECT 
  customer_id,
  COUNT(*) as order_count,
  SUM(amount) as total_amount
FROM orders
GROUP BY customer_id;
```

## Advanced Queries

### Deduplication (Keep Latest)

```sql
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY event_time DESC
    ) AS rn
  FROM events
)
WHERE rn = 1;
```

### Deduplication (Keep First)

```sql
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY event_time ASC
    ) AS rn
  FROM events
)
WHERE rn = 1;
```

### Top-N per Group

```sql
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY category 
      ORDER BY sales DESC
    ) AS rn
  FROM products
)
WHERE rn <= 5;
```

### MATCH_RECOGNIZE: Fraud Detection

```sql
SELECT *
FROM transactions
MATCH_RECOGNIZE (
  PARTITION BY account_id
  ORDER BY transaction_time
  MEASURES
    FIRST(A.transaction_time) AS first_txn,
    LAST(A.transaction_time) AS last_txn,
    COUNT(A.amount) AS txn_count,
    SUM(A.amount) AS total_amount
  ONE ROW PER MATCH
  AFTER MATCH SKIP PAST LAST ROW
  PATTERN (A{3,} B)
  DEFINE
    A AS A.amount > 1000 AND A.location <> LAG(A.location),
    B AS B.amount > 5000
) AS fraud;
```

### MATCH_RECOGNIZE: Session Detection

```sql
SELECT *
FROM page_views
MATCH_RECOGNIZE (
  PARTITION BY user_id
  ORDER BY view_time
  MEASURES
    FIRST(A.view_time) AS session_start,
    LAST(A.view_time) AS session_end,
    COUNT(*) AS page_count
  ONE ROW PER MATCH
  AFTER MATCH SKIP PAST LAST ROW
  PATTERN (A+)
  DEFINE
    A AS LAST(A.view_time, 1) IS NULL 
         OR A.view_time - LAST(A.view_time, 1) < INTERVAL '30' MINUTE
);
```

### JSON Processing

```sql
-- Extract nested JSON
SELECT 
  order_id,
  JSON_VALUE(payload, '$.customer.name') as customer_name,
  JSON_VALUE(payload, '$.items[0].product_id') as first_product,
  JSON_QUERY(payload, '$.items') as all_items
FROM orders;

-- Explode JSON array
SELECT 
  order_id,
  item.product_id,
  item.quantity
FROM orders,
LATERAL TABLE(JSON_ARRAY_ELEMENTS(JSON_QUERY(payload, '$.items'))) AS item;
```

### Conditional Aggregation

```sql
SELECT 
  window_start,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
  SUM(amount) FILTER (WHERE status = 'completed') as completed_revenue,
  AVG(amount) FILTER (WHERE amount > 100) as avg_large_order
FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(order_time), INTERVAL '1' HOUR))
GROUP BY window_start;
```

### Set Operations

```sql
-- Union (removes duplicates)
SELECT user_id, event_type FROM web_events
UNION
SELECT user_id, event_type FROM mobile_events;

-- Union All (keeps duplicates)
SELECT user_id, event_type FROM web_events
UNION ALL
SELECT user_id, event_type FROM mobile_events;

-- Intersect
SELECT user_id FROM active_users
INTERSECT
SELECT user_id FROM premium_users;

-- Except
SELECT user_id FROM all_users
EXCEPT
SELECT user_id FROM churned_users;
```

### Statement Sets (Multi-Insert)

```sql
-- Insert to multiple sinks from same source
BEGIN STATEMENT SET;

INSERT INTO high_value_orders
SELECT * FROM orders WHERE amount > 1000;

INSERT INTO regular_orders  
SELECT * FROM orders WHERE amount <= 1000;

INSERT INTO order_metrics
SELECT 
  DATE_FORMAT(order_time, 'yyyy-MM-dd') as order_date,
  COUNT(*) as order_count
FROM orders
GROUP BY DATE_FORMAT(order_time, 'yyyy-MM-dd');

END;
```

### Window Top-N

Unlike continuous Top-N above (which emits updating results), Window Top-N emits **final results per window** — no retractions.

```sql
-- Top 3 suppliers per 5-minute window (final, non-updating results)
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY window_start, window_end
      ORDER BY total_sales DESC
    ) AS rn
  FROM (
    SELECT 
      window_start, window_end,
      supplier_id,
      SUM(sales) as total_sales
    FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(order_time), INTERVAL '5' MINUTE))
    GROUP BY window_start, window_end, supplier_id
  )
)
WHERE rn <= 3;
```

### Late Data Routing with CURRENT_WATERMARK

Instead of dropping late data, route it to a separate sink for reprocessing:

```sql
-- Fork timely vs late data using CURRENT_WATERMARK
BEGIN STATEMENT SET;

INSERT INTO timely_events
SELECT * FROM events
WHERE event_time >= CURRENT_WATERMARK(event_time);

INSERT INTO late_events
SELECT * FROM events
WHERE event_time < CURRENT_WATERMARK(event_time);

END;
```

> **Tip:** Combine with Statement Sets (above) to process both paths in a single Flink job.

### SQL Hints (Runtime Connector Override)

Override table connector properties at query time without modifying catalog definitions:

```sql
-- Read from latest offset (ignoring catalog's startup mode)
SELECT * FROM orders /*+ OPTIONS('scan.startup.mode' = 'latest-offset') */;

-- Override parallelism for a specific scan
SELECT * FROM events /*+ OPTIONS('scan.parallelism' = '4') */;

-- Change format for debugging
SELECT * FROM raw_logs /*+ OPTIONS('format' = 'raw') */;
```

### CROSS JOIN UNNEST (Array Expansion)

Expand typed ARRAY columns into individual rows. Note: for JSON arrays, see JSON Processing above.

```sql
-- Expand an ARRAY column into rows
SELECT
  order_id,
  tag
FROM orders
CROSS JOIN UNNEST(tags) AS T(tag);

-- With preserved columns
SELECT
  order_id,
  customer_id,
  item_id,
  item_qty
FROM orders
CROSS JOIN UNNEST(items_id, items_qty) AS T(item_id, item_qty);
```
