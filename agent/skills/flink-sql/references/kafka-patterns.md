# Kafka Table API Patterns

Patterns for working with Apache Kafka® using Flink Table API and SQL.

## Table API with Kafka (OSS Flink)

### Basic Kafka Source Table

```sql
CREATE TABLE kafka_source (
    order_id VARCHAR(255) NOT NULL,
    customer_id INT NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    price DOUBLE NOT NULL,
    -- Event time from Kafka timestamp
    ts TIMESTAMP_LTZ(3) METADATA FROM 'timestamp' VIRTUAL,
    WATERMARK FOR ts AS ts - INTERVAL '1' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'orders',
    'properties.bootstrap.servers' = 'localhost:9092',
    'properties.group.id' = 'flink-consumer',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'json'
);
```

### Avro with Schema Registry

```sql
CREATE TABLE orders_avro (
    order_id VARCHAR(255) NOT NULL,
    customer_id INT NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    price DOUBLE NOT NULL,
    ts TIMESTAMP_LTZ(3) METADATA FROM 'timestamp' VIRTUAL,
    WATERMARK FOR ts AS ts - INTERVAL '1' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'orders',
    'properties.bootstrap.servers' = 'localhost:9092',
    'properties.security.protocol' = 'SASL_SSL',
    'properties.sasl.mechanism' = 'PLAIN',
    'properties.sasl.jaas.config' = 'org.apache.flink.kafka.shaded.org.apache.kafka.common.security.plain.PlainLoginModule required username="API_KEY" password="API_SECRET";',
    'properties.group.id' = 'flink-ptf-consumer',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'avro-confluent',
    'avro-confluent.url' = 'https://SR_ENDPOINT',
    'avro-confluent.basic-auth.credentials-source' = 'USER_INFO',
    'avro-confluent.basic-auth.user-info' = 'SR_API_KEY:SR_API_SECRET'
);
```

### Kafka Sink Table

```sql
CREATE TABLE kafka_sink (
    order_id VARCHAR(255) NOT NULL,
    customer_id INT NOT NULL,
    amount_usd DOUBLE NOT NULL,
    processing_timestamp TIMESTAMP(3)
) WITH (
    'connector' = 'kafka',
    'topic' = 'processed_orders',
    'properties.bootstrap.servers' = 'localhost:9092',
    'format' = 'json'
);

-- Write to sink
INSERT INTO kafka_sink
SELECT 
    order_id,
    customer_id,
    price * exchange_rate AS amount_usd,
    CURRENT_TIMESTAMP
FROM orders_avro;
```

---

## Upsert Kafka (Keyed Streams)

For tables that need UPDATE/DELETE semantics:

```sql
CREATE TABLE customer_state (
    customer_id INT NOT NULL,
    name STRING,
    total_orders INT,
    total_spent DOUBLE,
    last_order_time TIMESTAMP(3),
    PRIMARY KEY (customer_id) NOT ENFORCED
) WITH (
    'connector' = 'upsert-kafka',
    'topic' = 'customer-state',
    'properties.bootstrap.servers' = 'localhost:9092',
    'key.format' = 'json',
    'value.format' = 'json'
);

-- Upsert aggregation results
INSERT INTO customer_state
SELECT 
    customer_id,
    LAST_VALUE(name) AS name,
    COUNT(*) AS total_orders,
    SUM(price) AS total_spent,
    MAX(ts) AS last_order_time
FROM orders_avro
GROUP BY customer_id;
```

---

## Java Table API with Kafka

### Transaction Processor Pattern

From [gAmUssA/flink-kafka-table-api](https://github.com/gAmUssA/flink-kafka-table-api):

```java
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.table.api.Table;
import org.apache.flink.table.api.bridge.java.StreamTableEnvironment;
import static org.apache.flink.table.api.Expressions.*;

public class TransactionProcessor {
    
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        StreamTableEnvironment tableEnv = StreamTableEnvironment.create(env);
        
        // Create Kafka source table
        tableEnv.executeSql("""
            CREATE TABLE transactions (
                id STRING,
                amount DOUBLE,
                currency STRING,
                timestamp BIGINT,
                description STRING,
                merchant STRING,
                category STRING,
                status STRING,
                userId STRING,
                event_time AS TO_TIMESTAMP_LTZ(timestamp, 3),
                WATERMARK FOR event_time AS event_time - INTERVAL '1' SECOND
            ) WITH (
                'connector' = 'kafka',
                'topic' = 'transactions',
                'properties.bootstrap.servers' = 'localhost:9092',
                'properties.group.id' = 'flink-processor',
                'scan.startup.mode' = 'earliest-offset',
                'format' = 'avro-confluent',
                'avro-confluent.url' = 'http://localhost:8081'
            )
        """);
        
        // Filter and transform using Table API
        Table transactions = tableEnv.from("transactions");
        
        Table approved = transactions
            .filter($("status").isNotEqual("CANCELLED"))
            .select(
                $("id"),
                $("amount"),
                $("currency"),
                $("timestamp"),
                $("merchant"),
                $("userId"),
                // Static currency conversion
                $("amount").times(getExchangeRate($("currency"))).as("amountInUsd"),
                currentTimestamp().as("processingTimestamp")
            );
        
        // Create sink and write
        tableEnv.executeSql("""
            CREATE TABLE approved_transactions (
                id STRING,
                amount DOUBLE,
                currency STRING,
                timestamp BIGINT,
                merchant STRING,
                userId STRING,
                amountInUsd DOUBLE,
                processingTimestamp TIMESTAMP(3)
            ) WITH (
                'connector' = 'kafka',
                'topic' = 'approved_transactions',
                'properties.bootstrap.servers' = 'localhost:9092',
                'format' = 'avro-confluent',
                'avro-confluent.url' = 'http://localhost:8081'
            )
        """);
        
        approved.executeInsert("approved_transactions");
    }
}
```

---

## Flink vs Kafka Streams Comparison

From [gAmUssA/flink-vs-kafka-streams](https://github.com/gAmUssA/flink-vs-kafka-streams):

### Same Pipeline, Different Implementations

**Use Case:** Click events joined with categories, windowed aggregation of unique users.

#### Flink DataStream API

```java
public class FlinkDataStreamProcessor {
    public void process(StreamExecutionEnvironment env) {
        // Read clicks from Kafka
        KafkaSource<Click> clickSource = KafkaSource.<Click>builder()
            .setBootstrapServers(bootstrapServers)
            .setTopics("clicks")
            .setValueOnlyDeserializer(new ClickDeserializer())
            .build();
        
        DataStream<Click> clicks = env.fromSource(clickSource, WatermarkStrategy
            .<Click>forBoundedOutOfOrderness(Duration.ofSeconds(1))
            .withTimestampAssigner((event, timestamp) -> event.getTimestamp()));
        
        // Read categories
        KafkaSource<Category> categorySource = ...;
        DataStream<Category> categories = env.fromSource(categorySource, ...);
        
        // Broadcast join
        MapStateDescriptor<String, Category> categoryState = ...;
        BroadcastStream<Category> broadcastCategories = categories.broadcast(categoryState);
        
        DataStream<EnrichedClick> enriched = clicks
            .connect(broadcastCategories)
            .process(new CategoryEnrichmentFunction(categoryState));
        
        // Window aggregation
        DataStream<CategoryCount> result = enriched
            .keyBy(EnrichedClick::getCategoryId)
            .window(TumblingEventTimeWindows.of(Time.minutes(5)))
            .aggregate(new UniqueUserAggregator());
        
        // Write to Kafka
        result.sinkTo(KafkaSink.<CategoryCount>builder()...build());
    }
}
```

#### Flink Table API

```java
public class FlinkTableProcessor {
    public void process(StreamTableEnvironment tableEnv) {
        // Declarative approach
        tableEnv.executeSql("""
            CREATE TABLE clicks (
                click_id STRING,
                user_id STRING,
                category_id STRING,
                ts TIMESTAMP(3),
                WATERMARK FOR ts AS ts - INTERVAL '1' SECOND
            ) WITH ('connector' = 'kafka', ...)
        """);
        
        tableEnv.executeSql("""
            CREATE TABLE categories (
                category_id STRING,
                category_name STRING,
                PRIMARY KEY (category_id) NOT ENFORCED
            ) WITH ('connector' = 'kafka', 'scan.startup.mode' = 'earliest-offset', ...)
        """);
        
        // Join and aggregate in SQL
        tableEnv.executeSql("""
            INSERT INTO category_counts
            SELECT 
                c.category_id,
                cat.category_name,
                TUMBLE_START(c.ts, INTERVAL '5' MINUTE) AS window_start,
                TUMBLE_END(c.ts, INTERVAL '5' MINUTE) AS window_end,
                COUNT(DISTINCT c.user_id) AS unique_users
            FROM clicks c
            JOIN categories FOR SYSTEM_TIME AS OF c.ts AS cat
                ON c.category_id = cat.category_id
            GROUP BY 
                c.category_id, 
                cat.category_name,
                TUMBLE(c.ts, INTERVAL '5' MINUTE)
        """);
    }
}
```

#### Kafka Streams

```java
public class KafkaStreamsProcessor {
    public void process() {
        StreamsBuilder builder = new StreamsBuilder();
        
        // Read clicks
        KStream<String, Click> clicks = builder.stream("clicks");
        
        // Read categories as GlobalKTable for broadcast-style join
        GlobalKTable<String, Category> categories = builder.globalTable("categories");
        
        // Join
        KStream<String, EnrichedClick> enriched = clicks.join(
            categories,
            (clickKey, click) -> click.getCategoryId(),
            (click, category) -> new EnrichedClick(click, category)
        );
        
        // Window and aggregate
        enriched
            .groupBy((key, value) -> value.getCategoryId())
            .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
            .aggregate(
                HashSet::new,
                (key, value, users) -> { users.add(value.getUserId()); return users; },
                Materialized.as("unique-users-store")
            )
            .toStream()
            .map((windowedKey, users) -> KeyValue.pair(
                windowedKey.key(),
                new CategoryCount(windowedKey.key(), users.size(), windowedKey.window())
            ))
            .to("category-counts");
        
        new KafkaStreams(builder.build(), config).start();
    }
}
```

### When to Use Each

| Aspect | Flink Table/SQL | Flink DataStream | Kafka Streams |
|--------|-----------------|------------------|---------------|
| **Deployment** | Cluster required | Cluster required | Embedded (library) |
| **State Backend** | RocksDB/Heap | RocksDB/Heap | RocksDB (embedded) |
| **Exactly-Once** | ✅ Checkpoints | ✅ Checkpoints | ✅ Transactions |
| **Late Data** | ✅ Watermarks + allowed lateness | ✅ Full control | ⚠️ Limited (grace period) |
| **Event Time** | ✅ Native | ✅ Native | ⚠️ Stream-time |
| **SQL Support** | ✅ Full ANSI SQL | ❌ | ❌ (ksqlDB separate) |
| **Learning Curve** | Low (SQL) | High | Medium |
| **Operational** | Complex (cluster) | Complex (cluster) | Simple (library) |

---

## Kafka Connector Options Reference

### Source Options

| Option | Required | Description |
|--------|----------|-------------|
| `connector` | ✅ | `'kafka'` |
| `topic` | ✅ | Kafka topic name |
| `properties.bootstrap.servers` | ✅ | Kafka brokers |
| `properties.group.id` | ✅ | Consumer group ID |
| `scan.startup.mode` | ❌ | `earliest-offset`, `latest-offset`, `group-offsets`, `timestamp` |
| `scan.startup.timestamp-millis` | ❌ | For `timestamp` mode |
| `format` | ✅ | `json`, `avro`, `avro-confluent`, `csv` |
| `properties.security.protocol` | ❌ | `SASL_SSL` for Confluent Cloud |
| `properties.sasl.mechanism` | ❌ | `PLAIN` for Confluent Cloud |

### Sink Options

| Option | Required | Description |
|--------|----------|-------------|
| `connector` | ✅ | `'kafka'` |
| `topic` | ✅ | Kafka topic name |
| `properties.bootstrap.servers` | ✅ | Kafka brokers |
| `format` | ✅ | `json`, `avro`, `avro-confluent`, `csv` |
| `sink.partitioner` | ❌ | `default`, `fixed`, `round-robin`, custom class |
| `sink.delivery-guarantee` | ❌ | `at-least-once`, `exactly-once`, `none` |
| `sink.transactional-id-prefix` | ❌ | For exactly-once |

### Schema Registry Options (avro-confluent)

| Option | Required | Description |
|--------|----------|-------------|
| `avro-confluent.url` | ✅ | Schema Registry URL |
| `avro-confluent.basic-auth.credentials-source` | ❌ | `USER_INFO` for auth |
| `avro-confluent.basic-auth.user-info` | ❌ | `key:secret` |
| `avro-confluent.subject` | ❌ | Override subject name |

---

## Docker Setup for Local Development

From [gAmUssA gist](https://gist.github.com/gAmUssA/15aa29237f85816e39249d605ed250af):

```yaml
# docker-compose.yaml
version: '3.8'
services:
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:29093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    ports:
      - "8081:8081"
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka:9092
    depends_on:
      - kafka

  flink-jobmanager:
    image: flink:1.20-java17
    ports:
      - "8081:8081"
    command: jobmanager
    environment:
      FLINK_PROPERTIES: |
        jobmanager.rpc.address: flink-jobmanager

  flink-taskmanager:
    image: flink:1.20-java17
    command: taskmanager
    environment:
      FLINK_PROPERTIES: |
        jobmanager.rpc.address: flink-jobmanager
        taskmanager.numberOfTaskSlots: 4
    depends_on:
      - flink-jobmanager
```

**Test SQL:**
```sql
SELECT CURRENT_TIMESTAMP, RAND() FROM (VALUES (1)) AS t(n);
```

---

## Reference Repositories

- [gAmUssA/flink-kafka-table-api](https://github.com/gAmUssA/flink-kafka-table-api) — Transaction processing with Table API
- [gAmUssA/flink-vs-kafka-streams](https://github.com/gAmUssA/flink-vs-kafka-streams) — Comparative implementations
- [confluentinc/flink-table-api-java-examples](https://github.com/confluentinc/flink-table-api-java-examples) — Official Confluent examples
- [confluentinc/flink-table-api-python-examples](https://github.com/confluentinc/flink-table-api-python-examples) — Python examples
- [twalthr/flink-api-examples](https://github.com/twalthr/flink-api-examples) — Comprehensive API examples
