const EXAMPLES = [
    {
        title: "Simple Aggregation",
        mode: "BATCH",
        schema: `CREATE TEMPORARY TABLE orders (
    user_id INT,
    amount DOUBLE
) WITH (
    'connector' = 'datagen',
    'number-of-rows' = '100',
    'fields.user_id.min' = '1',
    'fields.user_id.max' = '5',
    'fields.amount.min' = '10',
    'fields.amount.max' = '500'
);`,
        query: `SELECT
    user_id,
    COUNT(*) AS order_count,
    ROUND(SUM(amount), 2) AS total_amount
FROM orders
GROUP BY user_id
ORDER BY user_id;`
    },
    {
        title: "Tumbling Window",
        mode: "STREAMING",
        schema: `CREATE TEMPORARY TABLE sensor_readings (
    sensor_id INT,
    temperature DOUBLE,
    event_time AS PROCTIME()
) WITH (
    'connector' = 'datagen',
    'rows-per-second' = '10',
    'fields.sensor_id.min' = '1',
    'fields.sensor_id.max' = '3',
    'fields.temperature.min' = '18',
    'fields.temperature.max' = '35'
);`,
        query: `-- Aggregate sensor readings in 10-second tumbling windows
SELECT
    sensor_id,
    TUMBLE_START(event_time, INTERVAL '10' SECOND) AS window_start,
    TUMBLE_END(event_time, INTERVAL '10' SECOND) AS window_end,
    COUNT(*) AS reading_count,
    ROUND(AVG(temperature), 1) AS avg_temp
FROM sensor_readings
GROUP BY
    sensor_id,
    TUMBLE(event_time, INTERVAL '10' SECOND);`
    },
    {
        title: "Hopping Window",
        mode: "STREAMING",
        schema: `CREATE TEMPORARY TABLE clicks (
    user_id INT,
    page STRING,
    click_time AS PROCTIME()
) WITH (
    'connector' = 'datagen',
    'rows-per-second' = '5',
    'fields.user_id.min' = '1',
    'fields.user_id.max' = '3',
    'fields.page.length' = '5'
);`,
        query: `-- Count clicks in 30s windows that slide every 10s
SELECT
    user_id,
    HOP_START(click_time, INTERVAL '10' SECOND, INTERVAL '30' SECOND) AS window_start,
    HOP_END(click_time, INTERVAL '10' SECOND, INTERVAL '30' SECOND) AS window_end,
    COUNT(*) AS click_count
FROM clicks
GROUP BY
    user_id,
    HOP(click_time, INTERVAL '10' SECOND, INTERVAL '30' SECOND);`
    },
    {
        title: "Cumulate Window",
        mode: "STREAMING",
        schema: `CREATE TEMPORARY TABLE page_views (
    page_id INT,
    view_time AS PROCTIME()
) WITH (
    'connector' = 'datagen',
    'rows-per-second' = '5',
    'fields.page_id.min' = '1',
    'fields.page_id.max' = '3'
);`,
        query: `-- Progressive aggregation: expand window every 5s up to 30s
SELECT
    page_id,
    CUMULATE_START(view_time, INTERVAL '5' SECOND, INTERVAL '30' SECOND) AS window_start,
    CUMULATE_END(view_time, INTERVAL '5' SECOND, INTERVAL '30' SECOND) AS window_end,
    COUNT(*) AS view_count
FROM page_views
GROUP BY
    page_id,
    CUMULATE(view_time, INTERVAL '5' SECOND, INTERVAL '30' SECOND);`
    },
    {
        title: "Interval Join",
        mode: "STREAMING",
        schema: `CREATE TEMPORARY TABLE orders_stream (
    order_id INT,
    product_id INT,
    order_time AS PROCTIME()
) WITH (
    'connector' = 'datagen',
    'rows-per-second' = '2',
    'fields.order_id.kind' = 'sequence',
    'fields.order_id.start' = '1',
    'fields.order_id.end' = '100',
    'fields.product_id.min' = '1',
    'fields.product_id.max' = '5'
);

CREATE TEMPORARY TABLE shipments (
    shipment_id INT,
    order_ref INT,
    ship_time AS PROCTIME()
) WITH (
    'connector' = 'datagen',
    'rows-per-second' = '2',
    'fields.shipment_id.kind' = 'sequence',
    'fields.shipment_id.start' = '1',
    'fields.shipment_id.end' = '100',
    'fields.order_ref.min' = '1',
    'fields.order_ref.max' = '5'
);`,
        query: `-- Join orders with shipments within a time interval
SELECT
    o.order_id,
    o.product_id,
    s.shipment_id,
    o.order_time,
    s.ship_time
FROM orders_stream o, shipments s
WHERE o.product_id = s.order_ref
    AND o.order_time BETWEEN s.ship_time - INTERVAL '10' SECOND
                         AND s.ship_time + INTERVAL '10' SECOND;`
    },
    {
        title: "Batch vs Streaming",
        mode: "STREAMING",
        schema: `-- Run this in both BATCH and STREAMING modes to see the difference!
-- BATCH: returns final aggregated result
-- STREAMING: returns a changelog with +I, -U, +U operations
CREATE TEMPORARY TABLE events (
    category INT,
    value INT
) WITH (
    'connector' = 'datagen',
    'number-of-rows' = '20',
    'fields.category.min' = '1',
    'fields.category.max' = '3',
    'fields.value.min' = '1',
    'fields.value.max' = '100'
);`,
        query: `-- Try toggling between Batch and Streaming mode!
-- Batch shows final results; Streaming shows the changelog
SELECT
    category,
    COUNT(*) AS event_count,
    SUM(value) AS total_value
FROM events
GROUP BY category;`
    }
];
