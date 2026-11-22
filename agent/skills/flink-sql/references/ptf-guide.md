# Process Table Functions (PTF) Guide

PTFs are the most powerful function kind in Flink — user-defined operators with full access to state, timers, and changelogs.

> **Note:** PTFs are available in Apache Flink 2.0+ (implementation phases ongoing). See [FLIP-440](https://cwiki.apache.org/confluence/pages/viewpage.action?pageId=298781093) for specification.

## What PTFs Enable

- Transform each row of a table
- Partition tables and apply per-partition logic  
- Manage custom state (ValueState, MapView, ListView)
- Schedule timers for delayed processing
- Handle CDC changelogs (insert/update/delete)
- Process multiple input streams (co-partition)
- Polymorphic table arguments (accept any schema)

Think of PTFs as bringing `KeyedProcessFunction` power to SQL.

## PTF vs Other Functions

| Feature | Scalar UDF | Table UDF | Aggregate UDF | PTF |
|---------|------------|-----------|---------------|-----|
| State access | ❌ | ❌ | Accumulator only | ✅ Full |
| Timer support | ❌ | ❌ | ❌ | ✅ |
| Changelog awareness | ❌ | ❌ | ❌ | ✅ |
| Multiple outputs | ❌ | ✅ | ❌ | ✅ |
| Multiple inputs | ❌ | ❌ | ❌ | ✅ |
| Partitioned processing | ❌ | ❌ | Via GROUP BY | ✅ Native |
| PASS_COLUMNS_THROUGH | ❌ | ❌ | ❌ | ✅ |

## Basic PTF Structure (Flink 2.2+)

```java
import org.apache.flink.table.annotation.*;
import org.apache.flink.table.functions.ProcessTableFunction;
import org.apache.flink.types.Row;
import static org.apache.flink.table.annotation.ArgumentTrait.*;

@FunctionHint(output = @DataTypeHint("ROW<key STRING, count BIGINT>"))
public class MyPTF extends ProcessTableFunction<Row> {
    
    public void eval(
        @ArgumentHint(SET_SEMANTIC_TABLE) Row input  // Partitioned input
    ) {
        collect(Row.of(input.getFieldAs("key"), 1L));
    }
}
```

## Row Semantics vs Set Semantics

### Row Semantics (Stateless, Per-Row)

Each row processed independently — no partitioning, no state allowed.

```java
@FunctionHint(output = @DataTypeHint("ROW<result STRING>"))
public class RowSemanticPTF extends ProcessTableFunction<Row> {
    
    public void eval(@ArgumentHint(ROW_SEMANTIC_TABLE) Row input) {
        String transformed = input.getFieldAs("name").toString().toUpperCase();
        collect(Row.of(transformed));
    }
}
```

**SQL Usage:**
```sql
SELECT * FROM my_ptf(input => TABLE input_table);
```

### Set Semantics (Stateful, Partitioned)

Rows partitioned by key — state scoped to partition.

```java
public void eval(
    @StateHint ValueState<Long> counter,
    @ArgumentHint(SET_SEMANTIC_TABLE) Row input
) throws Exception {
    Long count = counter.value();
    counter.update(count == null ? 1L : count + 1);
    collect(Row.of(input.getFieldAs("key"), counter.value()));
}
```

**SQL Usage:**
```sql
SELECT * FROM my_ptf(
    input => TABLE input_table PARTITION BY user_id,
    on_time => DESCRIPTOR(event_time),
    uid => 'my-ptf-v1'
);
```

---

## Real-World PTF Examples

The following examples are adapted from [MartijnVisser/flink-ptf-examples](https://github.com/MartijnVisser/flink-ptf-examples).

### 1. Anomaly Detector (MapView + ListView + POJO State)

Fraud detection with multiple state types and different TTLs.

```java
@FunctionHint(output = @DataTypeHint(
    "ROW<userId STRING, isAnomaly BOOLEAN, anomalyScore DOUBLE, reason STRING, transactionAmount DOUBLE, timestamp BIGINT>"))
public class AnomalyDetector extends ProcessTableFunction<Row> {
    
    // POJO state: tracks lifetime stats (30-day TTL)
    @StateHint(ttl = "30d")
    private ValueState<UserProfile> userState;
    
    // MapView: tracks transactions per merchant (24-hour TTL)
    @StateHint(ttl = "24h")
    private MapView<String, Integer> merchantCounts;
    
    // ListView: recent transaction history (7-day TTL)
    @StateHint(ttl = "7d") 
    private ListView<TransactionRecord> recentTransactions;

    public void eval(
        @StateHint ValueState<UserProfile> userState,
        @StateHint MapView<String, Integer> merchantCounts,
        @StateHint ListView<TransactionRecord> recentTransactions,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row input
    ) throws Exception {
        String userId = input.getFieldAs("userId");
        double amount = input.getFieldAs("amount");
        String merchantId = input.getFieldAs("merchantId");
        
        // Update merchant counts
        Integer count = merchantCounts.get(merchantId);
        merchantCounts.put(merchantId, count == null ? 1 : count + 1);
        
        // Add to history
        recentTransactions.add(new TransactionRecord(amount, merchantId, System.currentTimeMillis()));
        
        // Calculate anomaly score based on deviation from average
        UserProfile profile = userState.value();
        double score = 0.0;
        String reason = "NORMAL";
        
        if (profile != null && amount > profile.avgTransaction * 3) {
            score = 0.9;
            reason = "AMOUNT_SPIKE";
        }
        
        collect(Row.of(userId, score > 0.5, score, reason, amount, System.currentTimeMillis()));
    }
}
```

**SQL Usage:**
```sql
CREATE TABLE transactions (
    userId STRING,
    amount DOUBLE,
    merchantId STRING,
    ts BIGINT,
    event_time AS TO_TIMESTAMP_LTZ(ts, 3),
    WATERMARK FOR event_time AS event_time - INTERVAL '1' SECOND
) WITH ('connector' = 'datagen', 'rows-per-second' = '10');

CREATE FUNCTION AnomalyDetector AS 'com.flink.ptf.AnomalyDetector';

SELECT userId, isAnomaly, anomalyScore, reason, transactionAmount
FROM AnomalyDetector(
    input => TABLE transactions PARTITION BY userId,
    on_time => DESCRIPTOR(event_time),
    uid => 'anomaly-detector-v1'
);
```

---

### 2. Dynamic Pricing Engine (Multiple Input Streams)

Process inventory AND competitor prices simultaneously.

```java
@FunctionHint(output = @DataTypeHint(
    "ROW<sku STRING, newPrice DOUBLE, oldPrice DOUBLE, reason STRING, timestamp BIGINT>"))
public class DynamicPricingEngine extends ProcessTableFunction<Row> {

    public void eval(
        @StateHint(ttl = "7d") ValueState<PricingState> pricingState,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row inventoryEvent,  // First table
        @ArgumentHint(SET_SEMANTIC_TABLE) Row competitorPriceEvent  // Second table (optional)
    ) throws Exception {
        PricingState state = pricingState.value();
        if (state == null) state = new PricingState();
        
        // Handle inventory update
        if (inventoryEvent != null) {
            state.inventory = inventoryEvent.getFieldAs("quantity");
            state.basePrice = inventoryEvent.getFieldAs("basePrice");
        }
        
        // Handle competitor price (optional input)
        if (competitorPriceEvent != null) {
            state.competitorPrice = competitorPriceEvent.getFieldAs("price");
        }
        
        // Pricing rules (priority order)
        double newPrice = state.basePrice;
        String reason = "BASE_PRICE";
        
        if (state.inventory < 10) {
            newPrice = state.basePrice * 1.15;  // Low stock: +15%
            reason = "LOW_INVENTORY";
        } else if (state.competitorPrice != null && state.competitorPrice < state.basePrice) {
            newPrice = state.competitorPrice * 0.98;  // Undercut by 2%
            reason = "COMPETITOR_MATCH";
        }
        
        if (Math.abs(newPrice - state.currentPrice) > 0.01) {
            collect(Row.of(state.sku, newPrice, state.currentPrice, reason, System.currentTimeMillis()));
            state.currentPrice = newPrice;
        }
        
        pricingState.update(state);
    }
}
```

**SQL Usage:**
```sql
SELECT sku, newPrice, oldPrice, reason
FROM DynamicPricingEngine(
    inventoryEvent => TABLE inventory PARTITION BY sku,
    competitorPriceEvent => TABLE competitor_prices PARTITION BY sku,
    uid => 'pricing-engine-v1'
);
```

---

### 3. Session Tracker (ListView + Timers)

Track user sessions with configurable timeout.

```java
@FunctionHint(output = @DataTypeHint(
    "ROW<userId STRING, sessionStart TIMESTAMP, sessionEnd TIMESTAMP, eventCount INT, totalValue DOUBLE, eventTypes STRING>"))
public class SessionTracker extends ProcessTableFunction<Row> {

    public void eval(
        Context ctx,
        @StateHint(ttl = "2h") ValueState<SessionState> sessionState,
        @StateHint ListView<String> events,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row input,
        Long sessionTimeoutMillis
    ) throws Exception {
        String userId = input.getFieldAs("userId");
        double eventValue = input.getFieldAs("eventValue");
        String eventType = input.getFieldAs("eventType");
        long eventTime = ctx.time();
        
        SessionState session = sessionState.value();
        if (session == null) {
            session = new SessionState();
            session.sessionStart = eventTime;
        }
        
        session.eventCount++;
        session.totalValue += eventValue;
        events.add(eventType);
        
        // Extend session - register timer for timeout
        ctx.registerOnTime(eventTime + sessionTimeoutMillis);
        
        sessionState.update(session);
    }
    
    @OnTimer
    public void onTimer(Context ctx, 
            @StateHint ValueState<SessionState> sessionState,
            @StateHint ListView<String> events) throws Exception {
        SessionState session = sessionState.value();
        if (session != null) {
            // Collect event types
            StringBuilder types = new StringBuilder();
            for (String e : events.get()) {
                if (types.length() > 0) types.append(",");
                types.append(e);
            }
            
            collect(Row.of(
                session.userId,
                Timestamp.from(Instant.ofEpochMilli(session.sessionStart)),
                Timestamp.from(Instant.ofEpochMilli(ctx.time())),
                session.eventCount,
                session.totalValue,
                types.toString()
            ));
            
            // Clear state
            sessionState.clear();
            events.clear();
        }
    }
}
```

**SQL Usage:**
```sql
SELECT userId, sessionStart, sessionEnd, eventCount, totalValue, eventTypes
FROM SessionTracker(
    input => TABLE user_events PARTITION BY userId,
    sessionTimeoutMillis => CAST(30000 AS BIGINT),
    on_time => DESCRIPTOR(event_time),
    uid => 'session-tracker-v1'
);
```

---

### 4. First Match Join (Two Inputs, Once-Only Emission)

Emit enriched result exactly once when both sides arrive.

```java
@FunctionHint(output = @DataTypeHint(
    "ROW<orderId STRING, customerId INT, totalAmount DOUBLE, customerName STRING, customerTier STRING, joinTimestamp BIGINT>"))
public class FirstMatchJoin extends ProcessTableFunction<Row> {

    public void eval(
        Context ctx,
        @StateHint(ttl = "1h") ValueState<FirstMatchState> matchState,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row orderStream,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row customerStream
    ) throws Exception {
        FirstMatchState state = matchState.value();
        if (state == null) state = new FirstMatchState();
        
        // Already emitted? Ignore subsequent events
        if (state.emitted) return;
        
        // Capture order data
        if (orderStream != null) {
            state.orderId = orderStream.getFieldAs("orderId");
            state.totalAmount = orderStream.getFieldAs("totalAmount");
            state.hasOrder = true;
        }
        
        // Capture customer data
        if (customerStream != null) {
            state.customerName = customerStream.getFieldAs("name");
            state.customerTier = customerStream.getFieldAs("tier");
            state.hasCustomer = true;
        }
        
        // Emit when both sides arrived
        if (state.hasOrder && state.hasCustomer) {
            collect(Row.of(
                state.orderId,
                state.customerId,
                state.totalAmount,
                state.customerName,
                state.customerTier,
                ctx.time()
            ));
            state.emitted = true;
        }
        
        matchState.update(state);
    }
}
```

---

### 5. Changelog Auditor (Consuming SUPPORT_UPDATES)

Convert changelog stream to append-only audit log.

```java
@FunctionHint(
    input = @ArgumentHint(value = SET_SEMANTIC_TABLE, changelogMode = "I,UA,UB,D"),
    output = @DataTypeHint("ROW<change_type STRING, currency STRING, old_rate DECIMAL, new_rate DECIMAL, change_time TIMESTAMP>")
)
public class ChangelogAuditor extends ProcessTableFunction<Row> {

    public void eval(
        @StateHint(ttl = "7d") ValueState<BigDecimal> lastRate,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row input
    ) throws Exception {
        RowKind kind = input.getKind();
        String currency = input.getFieldAs("currency");
        BigDecimal rate = input.getFieldAs("rate");
        BigDecimal oldRate = lastRate.value();
        
        String changeType = switch (kind) {
            case INSERT -> "INSERT";
            case UPDATE_AFTER -> "UPDATE";
            case UPDATE_BEFORE -> "RETRACT";
            case DELETE -> "DELETE";
        };
        
        collect(Row.of(changeType, currency, oldRate, rate, Timestamp.from(Instant.now())));
        
        if (kind == RowKind.INSERT || kind == RowKind.UPDATE_AFTER) {
            lastRate.update(rate);
        } else if (kind == RowKind.DELETE) {
            lastRate.clear();
        }
    }
}
```

**SQL Usage:**
```sql
-- Create versioned view that produces changelog
CREATE VIEW versioned_rates AS
SELECT currency, rate, update_time
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY currency ORDER BY update_time DESC) AS rownum
    FROM currency_rates
) WHERE rownum = 1;

SELECT change_type, currency, old_rate, new_rate, change_time
FROM ChangelogAuditor(
    input => TABLE versioned_rates PARTITION BY currency,
    uid => 'changelog-auditor-v1'
);
```

---

### 6. Data Quality Scorer (PASS_COLUMNS_THROUGH)

Automatic column forwarding — preserves all input columns.

```java
@FunctionHint(
    argument = @ArgumentHint(value = ROW_SEMANTIC_TABLE, isPassColumnsThrough = true),
    output = @DataTypeHint("ROW<quality_score DOUBLE, quality_issues STRING, is_valid BOOLEAN>")
)
public class DataQualityScorer extends ProcessTableFunction<Row> {

    public void eval(@ArgumentHint(ROW_SEMANTIC_TABLE) Row input) {
        double score = 1.0;
        List<String> issues = new ArrayList<>();
        
        // Validate amount
        Double amount = input.getFieldAs("amount");
        if (amount == null || amount <= 0 || amount > 1_000_000) {
            score -= 0.3;
            issues.add("INVALID_AMOUNT");
        }
        
        // Validate country
        String country = input.getFieldAs("country");
        if (country == null || country.length() != 2) {
            score -= 0.2;
            issues.add("INVALID_COUNTRY");
        }
        
        collect(Row.of(score, String.join(",", issues), score >= 0.7));
    }
}
```

**SQL Usage — Output includes ALL input columns PLUS quality columns:**
```sql
SELECT *
FROM DataQualityScorer(
    input => TABLE transactions,
    uid => 'data-quality-v1'
);
-- Output: transactionId, userId, amount, country, ts, quality_score, quality_issues, is_valid
```

---

### 7. Polymorphic Table Arguments (Accept Any Schema)

Runtime schema discovery — works with any table.

```java
@FunctionHint(output = @DataTypeHint("ROW<formatted_row STRING, schema_info STRING, distinct_patterns BIGINT>"))
public class RowFormatter extends ProcessTableFunction<Row> {

    public void eval(
        Context ctx,
        @StateHint(ttl = "24h") MapView<String, Integer> seenPatterns,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row input  // No @DataTypeHint = polymorphic!
    ) throws Exception {
        // Discover schema at runtime
        var semantics = ctx.tableSemanticsFor("input");
        DataType actualSchema = semantics.dataType();
        int[] partitionKeys = semantics.partitionByColumns();
        
        // Format row dynamically
        StringBuilder formatted = new StringBuilder();
        for (int i = 0; i < input.getArity(); i++) {
            if (i > 0) formatted.append(", ");
            formatted.append(input.getField(i));
        }
        
        // Track patterns
        String pattern = formatted.toString();
        Integer count = seenPatterns.get(pattern);
        seenPatterns.put(pattern, count == null ? 1 : count + 1);
        
        collect(Row.of(formatted.toString(), actualSchema.toString(), seenPatterns.size()));
    }
}
```

**SQL Usage — Same PTF works with ANY table:**
```sql
-- Works with users table
SELECT * FROM RowFormatter(input => TABLE users PARTITION BY id, uid => 'rf-users');

-- Works with orders table  
SELECT * FROM RowFormatter(input => TABLE orders PARTITION BY customer_id, uid => 'rf-orders');
```

---

### 8. Hybrid Window (Time + Count Threshold)

Tumbling window with early emission on count threshold.

```java
@FunctionHint(output = @DataTypeHint(
    "ROW<window_start TIMESTAMP, window_end TIMESTAMP, num_orders INT, total_price DOUBLE>"))
public class HybridWindowFunction extends ProcessTableFunction<Row> {

    public void eval(
        Context ctx,
        @StateHint ValueState<WindowState> windowState,
        @ArgumentHint(SET_SEMANTIC_TABLE) Row input,
        Long windowSizeMillis,
        Integer countThreshold
    ) throws Exception {
        long eventTime = ctx.time();
        long windowStart = eventTime - (eventTime % windowSizeMillis);
        long windowEnd = windowStart + windowSizeMillis;
        
        WindowState state = windowState.value();
        
        // New window?
        if (state == null || eventTime >= state.windowEnd) {
            // Emit previous window if exists
            if (state != null) {
                emitWindow(state);
            }
            state = new WindowState(windowStart, windowEnd);
            ctx.registerOnTime(windowEnd);  // Timer for window close
        }
        
        state.orderCount++;
        state.totalPrice += input.<Double>getFieldAs("price");
        
        // Early emit on threshold
        if (state.orderCount >= countThreshold) {
            emitWindow(state);
            state = new WindowState(windowStart, windowEnd);  // Reset
        }
        
        windowState.update(state);
    }
    
    @OnTimer
    public void onTimer(Context ctx, @StateHint ValueState<WindowState> windowState) throws Exception {
        WindowState state = windowState.value();
        if (state != null && state.orderCount > 0) {
            emitWindow(state);
            windowState.clear();
        }
    }
    
    private void emitWindow(WindowState state) {
        collect(Row.of(
            Timestamp.from(Instant.ofEpochMilli(state.windowStart)),
            Timestamp.from(Instant.ofEpochMilli(state.windowEnd)),
            state.orderCount,
            state.totalPrice
        ));
    }
}
```

**SQL Usage:**
```sql
SELECT window_start, window_end, num_orders, total_price
FROM HybridWindow(
    input => TABLE orders PARTITION BY customer_id,
    windowSizeMillis => CAST(5000 AS BIGINT),
    countThreshold => 5000,
    on_time => DESCRIPTOR(ts),
    uid => 'hybrid-win-v1'
);
```

> **Note:** Due to [FLINK-37618](https://issues.apache.org/jira/browse/FLINK-37618), use `CAST(5000 AS BIGINT)` instead of `INTERVAL '5' SECONDS`.

---

### 9. DynamoDB Changelog Emitter (Producing ChangelogFunction)

Emit changelog output from append-only CDC input.

```java
@FunctionHint(output = @DataTypeHint(
    "ROW<pk STRING, sk STRING, attributes_json STRING, sequence_number STRING, event_time BIGINT>"))
public class DynamoDBChangelogEmitter extends ProcessTableFunction<Row> 
        implements ChangelogFunction {  // Declares retract mode
    
    @Override
    public ChangelogMode getChangelogMode() {
        return ChangelogMode.newBuilder()
            .addContainedKind(RowKind.INSERT)
            .addContainedKind(RowKind.UPDATE_BEFORE)
            .addContainedKind(RowKind.UPDATE_AFTER)
            .addContainedKind(RowKind.DELETE)
            .build();
    }

    public void eval(@ArgumentHint(SET_SEMANTIC_TABLE) Row input) {
        String eventName = input.getFieldAs("eventName");
        Row dynamodb = input.getFieldAs("dynamodb");
        
        switch (eventName) {
            case "INSERT":
                collect(Row.ofKind(RowKind.INSERT, extractFields(dynamodb.getFieldAs("NewImage"))));
                break;
            case "MODIFY":
                collect(Row.ofKind(RowKind.UPDATE_BEFORE, extractFields(dynamodb.getFieldAs("OldImage"))));
                collect(Row.ofKind(RowKind.UPDATE_AFTER, extractFields(dynamodb.getFieldAs("NewImage"))));
                break;
            case "REMOVE":
                collect(Row.ofKind(RowKind.DELETE, extractFields(dynamodb.getFieldAs("OldImage"))));
                break;
        }
    }
}
```

---

## State Types Reference

| Type | Description | Use Case | TTL Support |
|------|-------------|----------|-------------|
| `ValueState<T>` | Single value per key | Counters, POJO aggregates | ✅ |
| `ListView<T>` | List of values (backed by MapState) | Event sequences | ✅ |
| `MapView<K,V>` | Map per key (backed by MapState) | Aggregations by dimension | ✅ |
| `ListState<T>` | Raw list state | Low-level control | ✅ |
| `MapState<K,V>` | Raw map state | Low-level control | ✅ |
| `ReducingState<T>` | Auto-aggregating value | Running totals | ✅ |

### State TTL Configuration

```java
@StateHint(ttl = "24h")  // 24 hours
@StateHint(ttl = "7d")   // 7 days
@StateHint(ttl = "30d")  // 30 days
```

---

## SQL Usage Patterns

```sql
-- Row semantics (stateless)
SELECT * FROM my_ptf(input => TABLE input_table);

-- Set semantics with partition (stateful)
SELECT * FROM my_ptf(
    input => TABLE input_table PARTITION BY user_id,
    uid => 'my-ptf-v1'
);

-- With event-time ordering
SELECT * FROM my_ptf(
    input => TABLE input_table PARTITION BY user_id,
    on_time => DESCRIPTOR(event_time),
    uid => 'my-ptf-v1'
);

-- Multiple inputs (co-partition)
SELECT * FROM my_ptf(
    ordersEvent => TABLE orders PARTITION BY customer_id,
    customersEvent => TABLE customers PARTITION BY customer_id,
    uid => 'join-ptf-v1'
);

-- With scalar parameters
SELECT * FROM my_ptf(
    input => TABLE events PARTITION BY user_id,
    windowSizeMillis => CAST(5000 AS BIGINT),
    threshold => 100,
    on_time => DESCRIPTOR(event_time),
    uid => 'window-ptf-v1'
);
```

---

## Best Practices

1. **Always provide `uid`** for production PTFs — required for savepoint compatibility
2. **Use `@StateHint(ttl = "...")"`** to prevent unbounded state growth
3. **Use timers for cleanup** — don't rely solely on events
4. **Test changelog handling** — verify UPDATE_BEFORE/DELETE behavior
5. **POJO state classes** should be serializable with public fields or getters/setters
6. **Partition wisely** — high-cardinality keys can cause state explosion
7. **Multiple TTLs** — use different TTLs for different state types based on access patterns

## Known Limitations (Flink 2.2)

- `INTERVAL` arguments not supported ([FLINK-37618](https://issues.apache.org/jira/browse/FLINK-37618)) — use `CAST(ms AS BIGINT)`
- `PASS_COLUMNS_THROUGH` only works with single table argument, append-only, no timers
- Polymorphic table arguments require using `Context.tableSemanticsFor()` for schema discovery
- Aggregate UDFs (UDAFs) not yet supported in Confluent Cloud

## Reference Repositories

- [MartijnVisser/flink-ptf-examples](https://github.com/MartijnVisser/flink-ptf-examples) — Comprehensive PTF examples
- [Apache Flink PTF Documentation](https://nightlies.apache.org/flink/flink-docs-master/docs/dev/table/functions/ptfs/)
