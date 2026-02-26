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
        query: `-- Count clicks in 15s windows that slide every 5s
SELECT
    user_id,
    HOP_START(click_time, INTERVAL '5' SECOND, INTERVAL '15' SECOND) AS window_start,
    HOP_END(click_time, INTERVAL '5' SECOND, INTERVAL '15' SECOND) AS window_end,
    COUNT(*) AS click_count
FROM clicks
GROUP BY
    user_id,
    HOP(click_time, INTERVAL '5' SECOND, INTERVAL '15' SECOND);`
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
FROM sensor_readings s
JOIN tanks t ON s.tank_id = t.tank_id
JOIN recipes r ON s.recipe_id = r.recipe_id
GROUP BY
    t.tank_name, t.tank_type,
    r.beer_name, r.style,
    TUMBLE(s.event_time, INTERVAL '5' SECOND);`
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
    }
];
