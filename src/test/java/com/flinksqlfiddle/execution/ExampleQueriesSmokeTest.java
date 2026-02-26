package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Smoke tests for every UI example query in examples.js.
 * Uses the session-based execution path — the same code path the real app uses.
 *
 * Streaming adaptations for testability:
 * - 'rows-per-second' → 'number-of-rows' (bounded source so tests terminate)
 * - PROCTIME() → event-time with watermarks (so windows fire when source finishes)
 * - Window intervals shrunk for fast execution
 * - CUMULATE uses TVF syntax (the only syntax Flink supports for it)
 */
class ExampleQueriesSmokeTest {

    private FlinkEnvironmentFactory factory;
    private SqlExecutionService service;

    @BeforeEach
    void setUp() {
        factory = new FlinkEnvironmentFactory(
                new FlinkProperties(1, "8m", "32m", 5, null)
        );
        service = new SqlExecutionService(new SqlSecurityValidator());
    }

    /**
     * Splits multi-statement DDL on semicolons and executes each statement.
     */
    private void executeDdl(FlinkSession session, ExecutionMode mode, String schema) {
        for (String stmt : schema.split(";")) {
            String trimmed = stmt.trim();
            if (!trimmed.isEmpty() && !trimmed.startsWith("--")) {
                service.execute(session, mode, trimmed);
            }
        }
    }

    // --- Simple Aggregation (BATCH) ---

    @Test
    void simpleAggregation() {
        FlinkSession session = new FlinkSession("smoke-agg", factory);

        executeDdl(session, ExecutionMode.BATCH, """
                CREATE TEMPORARY TABLE orders (
                    user_id INT,
                    amount DOUBLE
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '100',
                    'fields.user_id.min' = '1',
                    'fields.user_id.max' = '5',
                    'fields.amount.min' = '10',
                    'fields.amount.max' = '500'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.BATCH, """
                SELECT
                    user_id,
                    COUNT(*) AS order_count,
                    ROUND(SUM(amount), 2) AS total_amount
                FROM orders
                GROUP BY user_id
                ORDER BY user_id
                """);

        assertEquals(List.of("user_id", "order_count", "total_amount"), result.getColumnNames());
        assertEquals(5, result.getRowCount());
        result.getRowKinds().forEach(kind -> assertEquals("+I", kind));
    }

    // --- Tumbling Window (STREAMING) ---

    @Test
    void tumblingWindow() {
        FlinkSession session = new FlinkSession("smoke-tumble", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE sensor_readings (
                    sensor_id INT,
                    temperature DOUBLE,
                    ts_offset INT,
                    event_time AS TIMESTAMPADD(SECOND, ts_offset, TIMESTAMP '2024-01-01 00:00:00'),
                    WATERMARK FOR event_time AS event_time - INTERVAL '1' SECOND
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.sensor_id.min' = '1',
                    'fields.sensor_id.max' = '3',
                    'fields.temperature.min' = '18',
                    'fields.temperature.max' = '35',
                    'fields.ts_offset.kind' = 'sequence',
                    'fields.ts_offset.start' = '0',
                    'fields.ts_offset.end' = '19'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    sensor_id,
                    TUMBLE_START(event_time, INTERVAL '10' SECOND) AS window_start,
                    TUMBLE_END(event_time, INTERVAL '10' SECOND) AS window_end,
                    COUNT(*) AS reading_count,
                    ROUND(AVG(temperature), 1) AS avg_temp
                FROM sensor_readings
                GROUP BY
                    sensor_id,
                    TUMBLE(event_time, INTERVAL '10' SECOND)
                """);

        assertTrue(result.getColumnNames().containsAll(
                List.of("sensor_id", "window_start", "reading_count", "avg_temp")));
        assertTrue(result.getRowCount() > 0, "Expected at least one tumbling-window row");
    }

    // --- Hopping Window (STREAMING) ---

    @Test
    void hoppingWindow() {
        FlinkSession session = new FlinkSession("smoke-hop", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE clicks (
                    user_id INT,
                    page STRING,
                    ts_offset INT,
                    click_time AS TIMESTAMPADD(SECOND, ts_offset, TIMESTAMP '2024-01-01 00:00:00'),
                    WATERMARK FOR click_time AS click_time - INTERVAL '1' SECOND
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.user_id.min' = '1',
                    'fields.user_id.max' = '3',
                    'fields.page.length' = '5',
                    'fields.ts_offset.kind' = 'sequence',
                    'fields.ts_offset.start' = '0',
                    'fields.ts_offset.end' = '19'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    user_id,
                    HOP_START(click_time, INTERVAL '5' SECOND, INTERVAL '15' SECOND) AS window_start,
                    HOP_END(click_time, INTERVAL '5' SECOND, INTERVAL '15' SECOND) AS window_end,
                    COUNT(*) AS click_count
                FROM clicks
                GROUP BY
                    user_id,
                    HOP(click_time, INTERVAL '5' SECOND, INTERVAL '15' SECOND)
                """);

        assertTrue(result.getColumnNames().containsAll(
                List.of("user_id", "window_start", "click_count")));
        assertTrue(result.getRowCount() > 0, "Expected at least one hopping-window row");
    }

    // --- Cumulate Window (STREAMING) ---

    @Test
    void cumulateWindow() {
        FlinkSession session = new FlinkSession("smoke-cumulate", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE page_views (
                    page_id INT,
                    ts_offset INT,
                    view_time AS TIMESTAMPADD(SECOND, ts_offset, TIMESTAMP '2024-01-01 00:00:00'),
                    WATERMARK FOR view_time AS view_time - INTERVAL '1' SECOND
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.page_id.min' = '1',
                    'fields.page_id.max' = '3',
                    'fields.ts_offset.kind' = 'sequence',
                    'fields.ts_offset.start' = '0',
                    'fields.ts_offset.end' = '19'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    page_id,
                    window_start,
                    window_end,
                    COUNT(*) AS view_count
                FROM TABLE(
                    CUMULATE(TABLE page_views, DESCRIPTOR(view_time), INTERVAL '2' SECOND, INTERVAL '10' SECOND)
                )
                GROUP BY page_id, window_start, window_end
                """);

        assertTrue(result.getColumnNames().containsAll(
                List.of("page_id", "window_start", "view_count")));
        assertTrue(result.getRowCount() > 0, "Expected at least one cumulate-window row");
    }

    // --- Interval Join (STREAMING) ---

    @Test
    void intervalJoin() {
        FlinkSession session = new FlinkSession("smoke-join", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE orders_stream (
                    order_id INT,
                    product_id INT,
                    order_time AS PROCTIME()
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.order_id.kind' = 'sequence',
                    'fields.order_id.start' = '1',
                    'fields.order_id.end' = '20',
                    'fields.product_id.min' = '1',
                    'fields.product_id.max' = '5'
                );

                CREATE TEMPORARY TABLE shipments (
                    shipment_id INT,
                    order_ref INT,
                    ship_time AS PROCTIME()
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.shipment_id.kind' = 'sequence',
                    'fields.shipment_id.start' = '1',
                    'fields.shipment_id.end' = '20',
                    'fields.order_ref.min' = '1',
                    'fields.order_ref.max' = '5'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    o.order_id,
                    o.product_id,
                    s.shipment_id,
                    o.order_time,
                    s.ship_time
                FROM orders_stream o, shipments s
                WHERE o.product_id = s.order_ref
                    AND o.order_time BETWEEN s.ship_time - INTERVAL '5' SECOND
                                         AND s.ship_time + INTERVAL '5' SECOND
                """);

        assertTrue(result.getColumnNames().containsAll(
                List.of("order_id", "product_id", "shipment_id")));
        assertTrue(result.getRowCount() > 0, "Expected at least one interval-join row");
    }

    // --- Batch vs Streaming: BATCH mode ---

    @Test
    void batchVsStreamingBatch() {
        FlinkSession session = new FlinkSession("smoke-bvs-batch", factory);

        executeDdl(session, ExecutionMode.BATCH, """
                CREATE TEMPORARY TABLE events (
                    category INT,
                    `value` INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.category.min' = '1',
                    'fields.category.max' = '3',
                    'fields.value.min' = '1',
                    'fields.value.max' = '100'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.BATCH, """
                SELECT
                    category,
                    COUNT(*) AS event_count,
                    SUM(`value`) AS total_value
                FROM events
                GROUP BY category
                """);

        assertEquals(List.of("category", "event_count", "total_value"), result.getColumnNames());
        assertEquals(3, result.getRowCount());
        result.getRowKinds().forEach(kind -> assertEquals("+I", kind));
    }

    // --- Batch vs Streaming: STREAMING mode ---

    @Test
    void batchVsStreamingStreaming() {
        FlinkSession session = new FlinkSession("smoke-bvs-stream", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE events (
                    category INT,
                    `value` INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.category.min' = '1',
                    'fields.category.max' = '3',
                    'fields.value.min' = '1',
                    'fields.value.max' = '100'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    category,
                    COUNT(*) AS event_count,
                    SUM(`value`) AS total_value
                FROM events
                GROUP BY category
                """);

        assertEquals(List.of("category", "event_count", "total_value"), result.getColumnNames());
        assertTrue(result.getRowCount() > 0, "Expected at least one streaming row");
        Set<String> validKinds = Set.of("+I", "-U", "+U", "-D");
        result.getRowKinds().forEach(kind ->
                assertTrue(validKinds.contains(kind), "Unexpected RowKind: " + kind));
    }
}
