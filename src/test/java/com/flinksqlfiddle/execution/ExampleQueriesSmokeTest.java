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

    // --- Realistic Orders (Faker, BATCH) ---

    @Test
    void fakerRealisticOrders() {
        FlinkSession session = new FlinkSession("smoke-faker", factory);

        executeDdl(session, ExecutionMode.BATCH, """
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
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.BATCH, """
                SELECT
                    customer_name,
                    product,
                    ROUND(amount, 2) AS amount,
                    city
                FROM fake_orders
                ORDER BY amount DESC
                """);

        assertEquals(List.of("customer_name", "product", "amount", "city"), result.getColumnNames());
        assertEquals(50, result.getRowCount());
        result.getRowKinds().forEach(kind -> assertEquals("+I", kind));
    }

    // --- Multi-table Faker DDL (BATCH) ---

    @Test
    void fakerMultiTableDdl() {
        FlinkSession session = new FlinkSession("smoke-faker-multi", factory);

        executeDdl(session, ExecutionMode.BATCH, """
                CREATE TEMPORARY TABLE customers (
                    customer_id INT,
                    name STRING
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '10',
                    'fields.customer_id.expression' = '#{Number.randomDigit}',
                    'fields.name.expression' = '#{Name.fullName}'
                );

                CREATE TEMPORARY TABLE products (
                    product_name STRING,
                    price DOUBLE
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '10',
                    'fields.product_name.expression' = '#{Commerce.productName}',
                    'fields.price.expression' = '#{Number.randomDouble ''2'',''1'',''100''}'
                )
                """);

        QueryResult customers = service.execute(session, ExecutionMode.BATCH,
                "SELECT * FROM customers");
        assertEquals(List.of("customer_id", "name"), customers.getColumnNames());
        assertEquals(10, customers.getRowCount());

        QueryResult products = service.execute(session, ExecutionMode.BATCH,
                "SELECT * FROM products");
        assertEquals(List.of("product_name", "price"), products.getColumnNames());
        assertEquals(10, products.getRowCount());
    }

    // --- E-Commerce Streaming (Faker, multi-table join) ---
    // Uses narrow ID ranges (1-5) so that bounded 20-row sources guarantee join matches.

    @Test
    void fakerEcommerceStreaming() {
        FlinkSession session = new FlinkSession("smoke-faker-ecom", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE products (
                    product_id STRING,
                    `name` STRING,
                    brand STRING,
                    vendor STRING,
                    department STRING,
                    PRIMARY KEY (product_id) NOT ENFORCED
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '20',
                    'fields.product_id.expression' = '#{Number.numberBetween ''1'',''5''}',
                    'fields.name.expression' = '#{Commerce.productName}',
                    'fields.brand.expression' = '#{Commerce.brand}',
                    'fields.vendor.expression' = '#{Commerce.vendor}',
                    'fields.department.expression' = '#{Commerce.department}'
                );

                CREATE TEMPORARY TABLE customers (
                    customer_id INT,
                    `name` STRING,
                    address STRING,
                    postcode STRING,
                    city STRING,
                    email STRING,
                    PRIMARY KEY (customer_id) NOT ENFORCED
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '20',
                    'fields.customer_id.expression' = '#{Number.numberBetween ''1'',''5''}',
                    'fields.name.expression' = '#{Name.fullName}',
                    'fields.address.expression' = '#{Address.streetAddress}',
                    'fields.postcode.expression' = '#{Address.postcode}',
                    'fields.city.expression' = '#{Address.city}',
                    'fields.email.expression' = '#{Internet.emailAddress}'
                );

                CREATE TEMPORARY TABLE orders (
                    order_id STRING,
                    customer_id INT,
                    product_id STRING,
                    price DOUBLE
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '20',
                    'fields.order_id.expression' = '#{Internet.UUID}',
                    'fields.customer_id.expression' = '#{Number.numberBetween ''1'',''5''}',
                    'fields.product_id.expression' = '#{Number.numberBetween ''1'',''5''}',
                    'fields.price.expression' = '#{Number.randomDouble ''2'',''10'',''100''}'
                );

                CREATE TEMPORARY TABLE clicks (
                    click_id STRING,
                    user_id INT,
                    url STRING,
                    user_agent STRING,
                    view_time INT
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '20',
                    'fields.click_id.expression' = '#{Internet.UUID}',
                    'fields.user_id.expression' = '#{Number.numberBetween ''1'',''100''}',
                    'fields.url.expression' = '#{regexify ''https://www[.]acme[.]com/product/[a-z]{5}-[a-z]{5}''}',
                    'fields.user_agent.expression' = '#{Internet.userAgent}',
                    'fields.view_time.expression' = '#{Number.numberBetween ''10'',''120''}'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    o.order_id,
                    c.`name` AS customer_name,
                    c.city,
                    p.`name` AS product_name,
                    p.department,
                    ROUND(o.price, 2) AS price
                FROM orders o
                JOIN customers c ON o.customer_id = c.customer_id
                JOIN products p ON o.product_id = p.product_id
                """);

        assertTrue(result.getColumnNames().containsAll(
                List.of("order_id", "customer_name", "city", "product_name", "department", "price")));
        assertTrue(result.getRowCount() > 0, "Expected at least one joined row");
    }

    // --- Brewmaster Monitoring (Faker, STREAMING) ---
    // Uses bounded rows + deterministic event time so windows fire in tests.

    @Test
    void fakerBrewmasterMonitoring() {
        FlinkSession session = new FlinkSession("smoke-brew", factory);

        executeDdl(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE tanks (
                    tank_id     INT,
                    tank_name   STRING,
                    tank_type   STRING,
                    capacity_liters INT,
                    location    STRING,
                    PRIMARY KEY (tank_id) NOT ENFORCED
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '10',
                    'fields.tank_id.expression' = '#{Number.numberBetween ''1'',''5''}',
                    'fields.tank_name.expression' = '#{regexify ''(Alpha|Bravo|Charlie)-(0[1-9])''}',
                    'fields.tank_type.expression' = '#{Options.option ''FERMENTER'',''BRITE_TANK''}',
                    'fields.capacity_liters.expression' = '#{Number.numberBetween ''500'',''5000''}',
                    'fields.location.expression' = '#{Options.option ''Building A'',''Building B''}'
                );

                CREATE TEMPORARY TABLE recipes (
                    recipe_id   INT,
                    beer_name   STRING,
                    style       STRING,
                    target_ibu  INT,
                    target_abv  DOUBLE,
                    PRIMARY KEY (recipe_id) NOT ENFORCED
                ) WITH (
                    'connector' = 'faker',
                    'number-of-rows' = '10',
                    'fields.recipe_id.expression' = '#{Number.numberBetween ''1'',''5''}',
                    'fields.beer_name.expression' = '#{Beer.name}',
                    'fields.style.expression' = '#{Beer.style}',
                    'fields.target_ibu.expression' = '#{Number.numberBetween ''10'',''100''}',
                    'fields.target_abv.expression' = '#{Number.randomDouble ''1'',''3'',''12''}'
                );

                CREATE TEMPORARY TABLE sensor_readings (
                    reading_id      STRING,
                    tank_id         INT,
                    recipe_id       INT,
                    temperature_c   DOUBLE,
                    pressure_psi    DOUBLE,
                    ph_level        DOUBLE,
                    ts_offset       INT,
                    event_time AS TIMESTAMPADD(SECOND, ts_offset, TIMESTAMP '2024-01-01 00:00:00'),
                    WATERMARK FOR event_time AS event_time - INTERVAL '1' SECOND
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '20',
                    'fields.reading_id.length' = '8',
                    'fields.tank_id.min' = '1',
                    'fields.tank_id.max' = '5',
                    'fields.recipe_id.min' = '1',
                    'fields.recipe_id.max' = '5',
                    'fields.temperature_c.min' = '2',
                    'fields.temperature_c.max' = '25',
                    'fields.pressure_psi.min' = '5',
                    'fields.pressure_psi.max' = '30',
                    'fields.ph_level.min' = '3',
                    'fields.ph_level.max' = '6',
                    'fields.ts_offset.kind' = 'sequence',
                    'fields.ts_offset.start' = '0',
                    'fields.ts_offset.end' = '19'
                )
                """);

        QueryResult result = service.execute(session, ExecutionMode.STREAMING, """
                SELECT
                    t.tank_name,
                    t.tank_type,
                    r.beer_name,
                    r.style,
                    COUNT(*)                        AS readings,
                    ROUND(AVG(s.temperature_c), 2)  AS avg_temp_c,
                    ROUND(AVG(s.pressure_psi), 2)   AS avg_pressure,
                    ROUND(AVG(s.ph_level), 2)       AS avg_ph
                FROM sensor_readings s
                JOIN tanks t ON s.tank_id = t.tank_id
                JOIN recipes r ON s.recipe_id = r.recipe_id
                GROUP BY
                    t.tank_name, t.tank_type,
                    r.beer_name, r.style,
                    TUMBLE(s.event_time, INTERVAL '10' SECOND)
                """);

        assertTrue(result.getColumnNames().containsAll(
                List.of("tank_name", "beer_name", "readings", "avg_temp_c")));
        assertTrue(result.getRowCount() > 0, "Expected at least one windowed row");
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
