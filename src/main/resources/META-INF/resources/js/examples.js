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
SELECT sensor_id, window_start, window_end,
    COUNT(*) AS reading_count,
    ROUND(AVG(temperature), 1) AS avg_temp
FROM TABLE(
    TUMBLE(TABLE sensor_readings, DESCRIPTOR(event_time), INTERVAL '10' SECOND)
)
GROUP BY sensor_id, window_start, window_end;`
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
        query: `-- Count clicks in 15s windows that slide every 5s
SELECT user_id, window_start, window_end,
    COUNT(*) AS click_count
FROM TABLE(
    HOP(TABLE clicks, DESCRIPTOR(click_time), INTERVAL '5' SECOND, INTERVAL '15' SECOND)
)
GROUP BY user_id, window_start, window_end;`
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
        query: `-- Progressive aggregation: expand window every 2s up to 10s
SELECT page_id, window_start, window_end,
    COUNT(*) AS view_count
FROM TABLE(
    CUMULATE(TABLE page_views, DESCRIPTOR(view_time), INTERVAL '2' SECOND, INTERVAL '10' SECOND)
)
GROUP BY page_id, window_start, window_end;`
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
        title: "Realistic Orders (Faker)",
        mode: "BATCH",
        schema: `CREATE TEMPORARY TABLE fake_orders (
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
);`,
        query: `-- Realistic fake data powered by DataFaker expressions
SELECT
    customer_name,
    product,
    ROUND(amount, 2) AS amount,
    city
FROM fake_orders
ORDER BY amount DESC;`
    },
    {
        title: "E-Commerce Streaming (Faker)",
        mode: "STREAMING",
        schema: `-- Products dimension table (upsert, keyed on product_id)
CREATE TEMPORARY TABLE products (
    product_id  STRING,
    \`name\`   STRING,
    brand       STRING,
    vendor      STRING,
    department  STRING,
    PRIMARY KEY (product_id) NOT ENFORCED
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '50',
    'fields.product_id.expression' = '#{Number.numberBetween ''1000'',''1500''}',
    'fields.name.expression' = '#{Commerce.productName}',
    'fields.brand.expression' = '#{Commerce.brand}',
    'fields.vendor.expression' = '#{Commerce.vendor}',
    'fields.department.expression' = '#{Commerce.department}'
);

-- Customers dimension table (upsert, keyed on customer_id)
CREATE TEMPORARY TABLE customers (
    customer_id INT,
    \`name\`   STRING,
    address     STRING,
    postcode    STRING,
    city        STRING,
    email       STRING,
    PRIMARY KEY (customer_id) NOT ENFORCED
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '50',
    'fields.customer_id.expression' = '#{Number.numberBetween ''3000'',''3250''}',
    'fields.name.expression' = '#{Name.fullName}',
    'fields.address.expression' = '#{Address.streetAddress}',
    'fields.postcode.expression' = '#{Address.postcode}',
    'fields.city.expression' = '#{Address.city}',
    'fields.email.expression' = '#{Internet.emailAddress}'
);

-- Orders fact table (append mode)
CREATE TEMPORARY TABLE orders (
    order_id    STRING,
    customer_id INT,
    product_id  STRING,
    price       DOUBLE
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '50',
    'fields.order_id.expression' = '#{Internet.UUID}',
    'fields.customer_id.expression' = '#{Number.numberBetween ''3000'',''3250''}',
    'fields.product_id.expression' = '#{Number.numberBetween ''1000'',''1500''}',
    'fields.price.expression' = '#{Number.randomDouble ''2'',''10'',''100''}'
);

-- Clickstream table (append mode)
CREATE TEMPORARY TABLE clicks (
    click_id    STRING,
    user_id     INT,
    url         STRING,
    user_agent  STRING,
    view_time   INT
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '50',
    'fields.click_id.expression' = '#{Internet.UUID}',
    'fields.user_id.expression' = '#{Number.numberBetween ''3000'',''5000''}',
    'fields.url.expression' = '#{regexify ''https://www[.]acme[.]com/product/[a-z]{5}-[a-z]{5}''}',
    'fields.user_agent.expression' = '#{Internet.userAgent}',
    'fields.view_time.expression' = '#{Number.numberBetween ''10'',''120''}'
);`,
        query: `-- Join orders with customers and products for a real-time sales dashboard
SELECT
    o.order_id,
    c.\`name\` AS customer_name,
    c.city,
    p.\`name\` AS product_name,
    p.department,
    ROUND(o.price, 2) AS price
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN products p ON o.product_id = p.product_id;`
    },
    {
        title: "Brewmaster Monitoring (Faker)",
        mode: "STREAMING",
        schema: `-- Brewery tank inventory (dimension, upsert)
CREATE TEMPORARY TABLE tanks (
    tank_id         INT,
    tank_name       STRING,
    tank_type       STRING,
    capacity_liters INT,
    location        STRING,
    PRIMARY KEY (tank_id) NOT ENFORCED
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '1',
    'fields.tank_id.expression' = '#{Number.numberBetween ''1'',''10''}',
    'fields.tank_name.expression' = '#{regexify ''(Alpha|Bravo|Charlie|Delta|Echo)-(0[1-9]|10)''}',
    'fields.tank_type.expression' = '#{Options.option ''FERMENTER'',''BRITE_TANK'',''MASH_TUN'',''KETTLE''}',
    'fields.capacity_liters.expression' = '#{Number.numberBetween ''500'',''5000''}',
    'fields.location.expression' = '#{Options.option ''Building A - East'',''Building A - West'',''Building B - Cellar'',''Outdoor Yard''}'
);

-- Beer recipes (dimension, upsert)
CREATE TEMPORARY TABLE recipes (
    recipe_id   INT,
    beer_name   STRING,
    style       STRING,
    target_ibu  INT,
    target_abv  DOUBLE,
    PRIMARY KEY (recipe_id) NOT ENFORCED
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '1',
    'fields.recipe_id.expression' = '#{Number.numberBetween ''1'',''10''}',
    'fields.beer_name.expression' = '#{Beer.name}',
    'fields.style.expression' = '#{Beer.style}',
    'fields.target_ibu.expression' = '#{Number.numberBetween ''10'',''100''}',
    'fields.target_abv.expression' = '#{Number.randomDouble ''1'',''3'',''12''}'
);

-- IoT sensor readings from tanks (the core stream!)
CREATE TEMPORARY TABLE sensor_readings (
    reading_id      STRING,
    tank_id         INT,
    recipe_id       INT,
    temperature_c   DOUBLE,
    pressure_psi    DOUBLE,
    ph_level        DOUBLE,
    event_time      AS PROCTIME()
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '100',
    'fields.reading_id.expression' = '#{Internet.UUID}',
    'fields.tank_id.expression' = '#{Number.numberBetween ''1'',''10''}',
    'fields.recipe_id.expression' = '#{Number.numberBetween ''1'',''10''}',
    'fields.temperature_c.expression' = '#{Number.randomDouble ''2'',''2'',''25''}',
    'fields.pressure_psi.expression' = '#{Number.randomDouble ''2'',''5'',''30''}',
    'fields.ph_level.expression' = '#{Number.randomDouble ''2'',''3'',''6''}'
);`,
        query: `-- Real-time tank dashboard: 5-second tumbling windows
SELECT
    t.tank_name,
    t.tank_type,
    r.beer_name,
    r.style,
    COUNT(*)                            AS readings,
    ROUND(AVG(s.temperature_c), 2)      AS avg_temp_c,
    ROUND(AVG(s.pressure_psi), 2)       AS avg_pressure,
    ROUND(AVG(s.ph_level), 2)           AS avg_ph
FROM TABLE(
    TUMBLE(TABLE sensor_readings, DESCRIPTOR(event_time), INTERVAL '5' SECOND)
) s
JOIN tanks t ON s.tank_id = t.tank_id
JOIN recipes r ON s.recipe_id = r.recipe_id
GROUP BY
    t.tank_name, t.tank_type,
    r.beer_name, r.style,
    window_start, window_end;`
    },
    {
        title: "Batch vs Streaming",
        mode: "STREAMING",
        schema: `-- Run this in both BATCH and STREAMING modes to see the difference!
-- BATCH: returns final aggregated result
-- STREAMING: returns a changelog with +I, -U, +U operations
CREATE TEMPORARY TABLE events (
    category INT,
    \`val\` INT
) WITH (
    'connector' = 'datagen',
    'number-of-rows' = '20',
    'fields.category.min' = '1',
    'fields.category.max' = '3',
    'fields.val.min' = '1',
    'fields.val.max' = '100'
);`,
        query: `-- Try toggling between Batch and Streaming mode!
-- Batch shows final results; Streaming shows the changelog
SELECT
    category,
    COUNT(*) AS event_count,
    SUM(\`val\`) AS total_value
FROM events
GROUP BY category;`
    },
    {
        title: "Transactions: Batch vs Streaming (Faker)",
        mode: "BATCH",
        schema: `-- The cold open: the SAME query, two fates. One rule explains everything —
-- BATCH needs a BOUNDED source ('number-of-rows') — STREAMING accepts an unbounded
-- one (omit it). Querying an unbounded table in BATCH fails on purpose.

-- Bounded twin -> legal in BATCH and STREAMING (batch returns; streaming completes).
CREATE TEMPORARY TABLE txns (
    txn_id  STRING,
    card_id INT,
    amount  DOUBLE,
    country STRING,
    city    STRING
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '200',
    'fields.txn_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}',
    'fields.country.expression' = '#{Address.countryCode}',
    'fields.city.expression' = '#{Address.city}'
);

-- Unbounded twin (identical fields, NO 'number-of-rows') -> STREAMING only.
-- Swap txns -> txns_live in the query and run STREAMING to watch it never end.
CREATE TEMPORARY TABLE txns_live (
    txn_id  STRING,
    card_id INT,
    amount  DOUBLE,
    country STRING,
    city    STRING
) WITH (
    'connector' = 'faker',
    'rows-per-second' = '5',
    'fields.txn_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}',
    'fields.country.expression' = '#{Address.countryCode}',
    'fields.city.expression' = '#{Address.city}'
);`,
        query: `-- BATCH: one final answer, the prompt returns (a photograph).
-- Toggle to STREAMING: the SAME query emits a +I / -U / +U changelog, then
--   completes because the source is bounded. Swap txns -> txns_live and it never ends.
SELECT
    card_id,
    COUNT(*) AS n,
    ROUND(SUM(amount), 2) AS total
FROM txns
GROUP BY card_id;`
    },
    {
        title: "Stream-Stream Join (Faker)",
        mode: "STREAMING",
        schema: `-- Two independent streams, joined on a shared key ("joining two rivers").
CREATE TEMPORARY TABLE txns (
    txn_id  STRING,
    card_id INT,
    amount  DOUBLE
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '50',
    'fields.txn_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}'
);

CREATE TEMPORARY TABLE shipments (
    shipment_id STRING,
    card_id     INT,
    carrier     STRING
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '20',
    'fields.shipment_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.carrier.expression' = '#{Company.name}'
);`,
        query: `SELECT t.txn_id, t.card_id, t.amount, s.carrier
FROM txns AS t
JOIN shipments AS s ON t.card_id = s.card_id;
-- GOTCHA: an unbounded stream-stream equi-join keeps BOTH sides in state forever.
--         Fine for a demo; in prod you bound it (interval / temporal join / state TTL)
--         or state grows without limit.`
    },
    {
        title: "Tumbling & Hopping Windows (Faker)",
        mode: "STREAMING",
        schema: `-- Event-time table with a WATERMARK. faker's date.past yields slightly
-- out-of-order timestamps — exactly what makes watermarks interesting.
CREATE TEMPORARY TABLE txn_events (
    txn_id     STRING,
    card_id    INT,
    amount     DOUBLE,
    ccy        STRING,
    country    STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '500',
    'fields.txn_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}',
    'fields.ccy.expression' = '#{regexify ''(USD|GBP|JPY|CHF|SEK)''}',
    'fields.country.expression' = '#{Address.countryCode}',
    'fields.event_time.expression' = '#{date.past ''15'',''SECONDS''}'
);`,
        query: `-- Tumbling: fixed, non-overlapping 10s buckets.
SELECT window_start, window_end, COUNT(*) AS txns, ROUND(SUM(amount), 2) AS total
FROM TABLE(TUMBLE(TABLE txn_events, DESCRIPTOR(event_time), INTERVAL '10' SECOND))
GROUP BY window_start, window_end;

-- Hopping (overlapping, slide 10s / size 30s) — swap the query above for this:
-- SELECT window_start, window_end, COUNT(*) AS txns
-- FROM TABLE(HOP(TABLE txn_events, DESCRIPTOR(event_time), INTERVAL '10' SECOND, INTERVAL '30' SECOND))
-- GROUP BY window_start, window_end;

-- GOTCHA: the current form is the windowing TVF — TABLE(TUMBLE(TABLE t, DESCRIPTOR(ts), ...)).
--         The old GROUP BY TUMBLE(rowtime, ...) is legacy. And the WATERMARK is a
--         latency-vs-completeness dial: too tight and Flink SILENTLY DROPS late rows.`
    },
    {
        title: "Temporal Join — enrich at event time (Faker)",
        mode: "STREAMING",
        schema: `-- Fact stream (event-time + watermark).
CREATE TEMPORARY TABLE txn_events (
    txn_id     STRING,
    card_id    INT,
    amount     DOUBLE,
    ccy        STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '500',
    'fields.txn_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}',
    'fields.ccy.expression' = '#{regexify ''(USD|GBP|JPY|CHF|SEK)''}',
    'fields.event_time.expression' = '#{date.past ''15'',''SECONDS''}'
);

-- A VERSIONED dimension table: needs a PRIMARY KEY and its own WATERMARK.
CREATE TEMPORARY TABLE fx_rates (
    ccy         STRING,
    rate_to_eur DOUBLE,
    rate_time   TIMESTAMP(3),
    WATERMARK FOR rate_time AS rate_time - INTERVAL '5' SECOND,
    PRIMARY KEY (ccy) NOT ENFORCED
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '50',
    'fields.ccy.expression' = '#{regexify ''(USD|GBP|JPY|CHF|SEK)''}',
    'fields.rate_to_eur.expression' = '#{Number.randomDouble ''3'',''0'',''2''}',
    'fields.rate_time.expression' = '#{date.past ''20'',''SECONDS''}'
);`,
        query: `-- Enrich each txn with the FX rate as it was AT THE TXN'S EVENT TIME.
SELECT
    t.txn_id,
    t.amount,
    r.rate_to_eur,
    ROUND(t.amount * r.rate_to_eur, 2) AS amount_eur
FROM txn_events AS t
JOIN fx_rates FOR SYSTEM_TIME AS OF t.event_time AS r
  ON t.ccy = r.ccy;
-- GOTCHA: the right side MUST be versioned — PRIMARY KEY + WATERMARK. Forget the
--         watermark on the dimension and Flink can't reconstruct "the rate as of 9:42",
--         so the join just refuses. People blame the join; it's the DDL.`
    },
    {
        title: "Fraud: Impossible Travel (MATCH_RECOGNIZE)",
        mode: "STREAMING",
        schema: `-- Same card, two different countries, within 10 seconds -> impossible travel.
CREATE TEMPORARY TABLE txn_events (
    txn_id     STRING,
    card_id    INT,
    amount     DOUBLE,
    country    STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'faker',
    'number-of-rows' = '500',
    'fields.txn_id.expression' = '#{Internet.UUID}',
    'fields.card_id.expression' = '#{Number.numberBetween ''1'',''8''}',
    'fields.amount.expression' = '#{Number.randomDouble ''2'',''5'',''500''}',
    'fields.country.expression' = '#{Address.countryCode}',
    'fields.event_time.expression' = '#{date.past ''15'',''SECONDS''}'
);`,
        query: `SELECT *
FROM txn_events
MATCH_RECOGNIZE (
    PARTITION BY card_id
    ORDER BY event_time
    MEASURES
        A.country    AS country_1,
        B.country    AS country_2,
        A.event_time AS t1,
        B.event_time AS t2
    ONE ROW PER MATCH
    AFTER MATCH SKIP PAST LAST ROW
    PATTERN (A B) WITHIN INTERVAL '10' SECOND
    DEFINE
        B AS B.country <> A.country
) AS impossible_travel;
-- GOTCHA: WITHIN INTERVAL '10' SECOND isn't just a filter — it BOUNDS THE STATE Flink
--         keeps per card. Drop it and you ask Flink to remember every card forever.`
    }
];
