'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const load = () => import(path.join(__dirname, '../../main/frontend/sql-schema.mjs'));

const ORDERS_DDL = `-- orders from datagen
CREATE TEMPORARY TABLE orders (
  user_id INT NOT NULL,
  amount DECIMAL(10, 2),
  tags ARRAY<STRING>,
  addr ROW<city STRING, zip INT>,
  big AS CASE WHEN amount > 5 THEN 1 ELSE 0 END,
  ts TIMESTAMP(3) METADATA FROM 'timestamp',
  WATERMARK FOR ts AS ts - INTERVAL '5' SECOND,
  PRIMARY KEY (user_id) NOT ENFORCED
) WITH ('connector' = 'datagen', 'number-of-rows' = '10');

CREATE TABLE IF NOT EXISTS \`cat\`.\`db\`.\`page views\` (url STRING) WITH ('connector' = 'faker');`;

test('parseCreateTables reads names and columns, skipping watermarks and keys', async () => {
  const { parseCreateTables } = await load();
  assert.deepEqual(parseCreateTables(ORDERS_DDL), [
    { name: 'orders', columns: [
      { name: 'user_id', type: 'INT', kind: 'physical' },
      { name: 'amount', type: 'DECIMAL(10, 2)', kind: 'physical' },
      { name: 'tags', type: 'ARRAY<STRING>', kind: 'physical' },
      { name: 'addr', type: 'ROW<city STRING, zip INT>', kind: 'physical' },
      { name: 'big', type: 'computed', kind: 'computed' },
      { name: 'ts', type: 'TIMESTAMP(3)', kind: 'metadata' },
    ] },
    { name: 'page views', columns: [{ name: 'url', type: 'STRING', kind: 'physical' }] },
  ]);
});

test('parseCreateTables keeps the columns of an unfinished statement and ignores commented ones', async () => {
  const { parseCreateTables } = await load();
  assert.deepEqual(parseCreateTables('/* CREATE TABLE ghost (x INT) */\nCREATE TABLE t (\n  a INT,\n  b STR'),
    [{ name: 't', columns: [{ name: 'a', type: 'INT', kind: 'physical' }, { name: 'b', type: 'STR', kind: 'physical' }] }]);
  assert.deepEqual(parseCreateTables("SELECT 'CREATE TABLE fake (x INT)'"), []);
});

test('parseCreateTables keeps columns that follow a comment, with the comment out of the type', async () => {
  const { parseCreateTables } = await load();
  const names = (ddl) => parseCreateTables(ddl)[0].columns.map((c) => c.name);
  assert.deepEqual(names('CREATE TABLE t (\n  id INT, -- the id\n  name STRING,\n  -- price\n  price INT\n)'),
    ['id', 'name', 'price']);
  assert.deepEqual(names('CREATE TABLE t (\n  -- id\n  id INT, name STRING)'), ['id', 'name']);
  assert.deepEqual(names('CREATE TABLE t (/* k */ id INT, name STRING)'), ['id', 'name']);
  assert.deepEqual(parseCreateTables('CREATE TABLE t (id INT -- metadata note\n, x AS id /* c */ + 1, y INT)')[0].columns, [
    { name: 'id', type: 'INT', kind: 'physical' },
    { name: 'x', type: 'computed', kind: 'computed' },
    { name: 'y', type: 'INT', kind: 'physical' },
  ]);
});

test('optionContext offers per-column options for a column after a comment', async () => {
  const { optionContext } = await load();
  const ctx = optionContext("CREATE TABLE t (\n  -- the id\n  id INT,\n  name STRING\n) WITH ('connector' = 'datagen', 'fields.");
  assert.deepEqual(ctx.columns.map((c) => c.name), ['id', 'name']);
});

test('referencedTables finds FROM, JOIN, window TABLE and INTO targets', async () => {
  const { referencedTables } = await load();
  assert.deepEqual(referencedTables(
    "SELECT * FROM TABLE(TUMBLE(TABLE Orders, DESCRIPTOR(ts), INTERVAL '1' MINUTE)) o JOIN `cat`.`db`.users u ON o.id = u.id"),
  ['orders', 'users']);
  assert.deepEqual(referencedTables("INSERT INTO sink SELECT 'from x' FROM src"), ['sink', 'src']);
  assert.deepEqual(referencedTables('SELECT 1'), []);
});

test('columnCandidates offers the referenced tables, or every table when none is referenced', async () => {
  const { columnCandidates } = await load();
  const tables = [
    { name: 'orders', columns: [{ name: 'user_id', type: 'INT' }, { name: 'region', type: 'STRING' }] },
    { name: 'users', columns: [{ name: 'user_id', type: 'INT' }, { name: 'email', type: 'STRING' }] },
  ];
  assert.deepEqual(columnCandidates('SELECT  FROM users', tables).map((c) => c.label), ['user_id', 'email']);
  assert.deepEqual(columnCandidates('SELECT ', tables).map((c) => c.label), ['user_id', 'region', 'email']);
  assert.equal(columnCandidates('SELECT  FROM orders', tables)[1].detail, 'STRING · orders');
  assert.deepEqual(columnCandidates('SELECT reg FROM pending', tables), []);
  assert.deepEqual(columnCandidates('SELECT reg FROM pending JOIN users u ON 1 = 1', tables).map((c) => c.label),
    ['user_id', 'email']);
});

test('quoteIdentifier backticks names that are not plain identifiers or are reserved', async () => {
  const { quoteIdentifier, columnCandidates } = await load();
  assert.equal(quoteIdentifier('user_id'), 'user_id');
  assert.equal(quoteIdentifier('Region2'), 'Region2');
  assert.equal(quoteIdentifier('page views'), '`page views`');
  assert.equal(quoteIdentifier('select'), '`select`');
  assert.equal(quoteIdentifier('Order'), '`Order`');
  assert.equal(quoteIdentifier('timestamp'), '`timestamp`');
  assert.equal(quoteIdentifier('max'), '`max`');
  assert.equal(quoteIdentifier('9lives'), '`9lives`');
  assert.equal(quoteIdentifier('a`b'), '`a``b`');
  const tables = [{ name: 'people', columns: [{ name: 'full name', type: 'STRING' }, { name: 'age', type: 'INT' }] }];
  assert.deepEqual(columnCandidates('SELECT  FROM people', tables).map((c) => [c.label, c.apply]),
    [['full name', '`full name`'], ['age', 'age']]);
});

test('mergeTables lets the earlier list win on a case-insensitive name clash', async () => {
  const { mergeTables } = await load();
  const server = [{ name: 'Orders', columns: [{ name: 'a' }] }];
  const draft = [{ name: 'orders', columns: [{ name: 'b' }] }, { name: 'users', columns: [] }];
  assert.deepEqual(mergeTables(server, draft).map((t) => [t.name, t.columns.length]), [['Orders', 1], ['users', 0]]);
});

test('statementAt returns the statement around a position, ignoring ; inside strings', async () => {
  const { statementAt } = await load();
  const text = "SELECT ';' FROM a; SELECT x FROM b";
  assert.equal(statementAt(text, 3).text, "SELECT ';' FROM a");
  assert.equal(statementAt(text, text.length).text, ' SELECT x FROM b');
});

test('optionContext recognises an open key quote and the value of a key', async () => {
  const { optionContext } = await load();
  const head = "CREATE TABLE t (id INT, name STRING) WITH ('connector' = 'faker', ";
  assert.deepEqual(optionContext(head + "'fie"),
    { kind: 'key', key: null, typed: 'fie', connector: 'faker',
      columns: [{ name: 'id', type: 'INT' }, { name: 'name', type: 'STRING' }], used: ['connector'] });
  assert.deepEqual(optionContext("CREATE TABLE t (id INT) WITH ('connector' = 'da"),
    { kind: 'value', key: 'connector', typed: 'da', connector: null, columns: [{ name: 'id', type: 'INT' }],
      used: ['connector'] });
  assert.equal(optionContext("SELECT 'abc"), null);
  assert.equal(optionContext(head + "'x' = 'y')"), null);
  assert.equal(optionContext("CREATE TABLE t (id INT) WITH ('connector' = 'faker') -- 'x"), null);
});

test('optionContext reads the connector outside comments', async () => {
  const { optionContext } = await load();
  const ctx = optionContext("CREATE TABLE t (id INT) WITH (\n  -- 'connector' = 'faker'\n  'connector' = 'datagen', 'fi");
  assert.equal(ctx.connector, 'datagen');
  assert.equal(optionContext("CREATE TABLE t (id INT) WITH (\n  /* 'connector' = 'faker', */ 'fi").connector, null);
});

test('optionContext offers per-column options for physical columns only', async () => {
  const { optionContext } = await load();
  const ctx = optionContext("CREATE TABLE t (id INT, big AS id * 2, ts TIMESTAMP(3) METADATA FROM 'timestamp', "
    + "note STRING COMMENT 'no metadata here') WITH ('connector' = 'datagen', 'fields.");
  assert.deepEqual(ctx.columns.map((c) => c.name), ['id', 'note']);
});

test('optionCandidates expands per-column options for the declared connector', async () => {
  const { optionCandidates } = await load();
  assert.deepEqual(optionCandidates({ kind: 'key', connector: 'faker', columns: [{ name: 'id', type: 'INT' }] }),
    ['connector', 'number-of-rows', 'rows-per-second', 'fields.id.expression', 'fields.id.null-rate']);
  assert.deepEqual(optionCandidates({ kind: 'key', connector: null, columns: [{ name: 'id', type: 'INT' }] }), ['connector']);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'connector' }), ['datagen', 'faker', 'print', 'blackhole']);
  const datagenId = { connector: 'datagen', columns: [{ name: 'id', type: 'INT' }] };
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'fields.id.kind', ...datagenId }), ['random', 'sequence']);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'number-of-rows' }), []);
  assert.deepEqual(optionCandidates(null), []);
  for (const connector of ['constructor', '__proto__', 'toString']) {
    assert.deepEqual(optionCandidates({ kind: 'key', connector, columns: [] }), ['connector']);
  }
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'constructor' }), []);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'fields.id.__proto__' }), []);
});

test('faker options follow FlinkFakerTableSourceFactory per column type', async () => {
  const { optionContext, optionCandidates } = await load();
  const fields = (ddl) => optionCandidates(optionContext(`CREATE TABLE t (${ddl}) WITH ('connector' = 'faker', 'f`))
    .filter((k) => k.startsWith('fields.'));
  assert.deepEqual(fields('id INT'), ['fields.id.expression', 'fields.id.null-rate']);
  assert.deepEqual(fields('tags ARRAY<STRING>, codes INT MULTISET'), [
    'fields.tags.expression', 'fields.tags.null-rate', 'fields.tags.length',
    'fields.codes.expression', 'fields.codes.null-rate', 'fields.codes.length']);
  assert.deepEqual(fields('addr ROW<city STRING, `zip code` INT>'),
    ['fields.addr.city.expression', 'fields.addr.zip code.expression', 'fields.addr.null-rate']);
  assert.deepEqual(fields('m MAP<STRING, INT>'),
    ['fields.m.key.expression', 'fields.m.value.expression', 'fields.m.null-rate', 'fields.m.length']);
});

test('datagen options follow DataGenTableSourceFactory per column type', async () => {
  const { optionContext, optionCandidates } = await load();
  const fields = (ddl) => optionCandidates(optionContext(`CREATE TABLE t (${ddl}) WITH ('connector' = 'datagen', 'f`))
    .filter((k) => k.startsWith('fields.'));
  assert.deepEqual(fields('id BIGINT'),
    ['fields.id.kind', 'fields.id.min', 'fields.id.max', 'fields.id.start', 'fields.id.end', 'fields.id.null-rate']);
  assert.deepEqual(fields('s STRING'),
    ['fields.s.kind', 'fields.s.length', 'fields.s.var-len', 'fields.s.start', 'fields.s.end', 'fields.s.null-rate']);
  // VARBINARY / BYTES: visit(VarBinaryType) declares length and var-len only, no null-rate.
  assert.deepEqual(fields('b BYTES'),
    ['fields.b.kind', 'fields.b.length', 'fields.b.var-len', 'fields.b.start', 'fields.b.end']);
  assert.deepEqual(fields('vb VARBINARY(8)'),
    ['fields.vb.kind', 'fields.vb.length', 'fields.vb.var-len', 'fields.vb.start', 'fields.vb.end']);
  // BINARY: visit(BinaryType) declares no option; the sequence generator reads start / end.
  assert.deepEqual(fields('bin BINARY(4)'), ['fields.bin.kind', 'fields.bin.start', 'fields.bin.end']);
  assert.deepEqual(fields('c CHAR(3)'), ['fields.c.kind', 'fields.c.start', 'fields.c.end', 'fields.c.null-rate']);
  assert.deepEqual(fields('ts TIMESTAMP_LTZ(3)'), ['fields.ts.kind', 'fields.ts.max-past', 'fields.ts.null-rate']);
  assert.deepEqual(fields('tags ARRAY<INT>'), ['fields.tags.kind', 'fields.tags.length', 'fields.tags.null-rate']);
  assert.deepEqual(fields('m MAP<STRING, INT>'), ['fields.m.kind', 'fields.m.length', 'fields.m.null-rate']);
  // DATE and TIME: DataGenVisitorBase declares no option for them.
  assert.deepEqual(fields('flag BOOLEAN, d DATE, tm TIME(3)'),
    ['fields.flag.kind', 'fields.flag.null-rate', 'fields.d.kind', 'fields.tm.kind']);
});

test('tableAliases maps aliases and table names, ignoring clause keywords', async () => {
  const { tableAliases } = await load();
  const plain = (sql) => ({ ...tableAliases(sql) });
  assert.deepEqual(plain('SELECT * FROM orders o JOIN users AS u ON o.id = u.id WHERE 1 = 1'),
    { orders: 'orders', o: 'orders', users: 'users', u: 'users' });
  assert.deepEqual(plain('SELECT * FROM Orders WHERE x = 1'), { orders: 'Orders' });
  assert.equal(tableAliases('SELECT * FROM __proto__ p').__proto__, '__proto__');
  assert.deepEqual(plain('SELECT * FROM trades AS `order` WHERE `order`.ven'), { trades: 'trades', order: 'trades' });
  assert.deepEqual(plain('SELECT * FROM trades `select` WHERE `select`.ven'), { trades: 'trades', select: 'trades' });
});

const INTERVAL_JOIN = `SELECT o.order_id, s.shipment_id
FROM orders_stream o, shipments s
WHERE o.product_id = s.order_ref`;

test('statementRelations reads every FROM item, its alias and each JOIN after a bare table', async () => {
  const { statementRelations, referencedTables, tableAliases } = await load();
  assert.deepEqual(statementRelations('SELECT * FROM orders JOIN users u ON orders.id = u.id'),
    [{ table: 'orders', alias: null }, { table: 'users', alias: 'u' }]);
  assert.deepEqual({ ...tableAliases('SELECT * FROM orders JOIN users u ON 1 = 1') },
    { orders: 'orders', users: 'users', u: 'users' });
  assert.deepEqual(referencedTables(INTERVAL_JOIN), ['orders_stream', 'shipments']);
  assert.deepEqual({ ...tableAliases(INTERVAL_JOIN) },
    { orders_stream: 'orders_stream', o: 'orders_stream', shipments: 'shipments', s: 'shipments' });
  assert.deepEqual(statementRelations('SELECT * FROM a AS x, `b c` y, cat.db.d -- e\n, (SELECT 1 FROM f) g, h GROUP BY k, l'),
    [{ table: 'a', alias: 'x' }, { table: 'b c', alias: 'y' }, { table: 'd', alias: null },
      { table: 'h', alias: null }, { table: 'f', alias: null }]); // a subquery's own FROM follows its list
  assert.deepEqual(referencedTables('SELECT * FROM t, LATERAL TABLE(fn(x)) AS T(a), u'), ['t', 'u']);
});

test('statementRelations reads an INSERT target with a column list', async () => {
  const { referencedTables, columnCandidates } = await load();
  assert.deepEqual(referencedTables('INSERT INTO sink (a, b) SELECT x FROM src'), ['sink', 'src']);
  const tables = [
    { name: 'sink', columns: [{ name: 'a', type: 'INT' }, { name: 'b', type: 'INT' }] },
    { name: 'orders', columns: [{ name: 'region', type: 'STRING' }] },
  ];
  assert.deepEqual(columnCandidates('INSERT INTO sink (a, ', tables).map((c) => c.label), ['a', 'b']);
});

const TEMPORAL_JOIN = `SELECT t.txn_id, r.rate_to_eur
FROM txn_events AS t
JOIN fx_rates FOR SYSTEM_TIME AS OF t.event_time AS r
  ON t.ccy = r.ccy`;

test('tableAliases reads the alias after FOR SYSTEM_TIME AS OF', async () => {
  const { tableAliases } = await load();
  assert.deepEqual({ ...tableAliases(TEMPORAL_JOIN) },
    { txn_events: 'txn_events', t: 'txn_events', fx_rates: 'fx_rates', r: 'fx_rates' });
  assert.deepEqual({ ...tableAliases('SELECT * FROM a JOIN b FOR SYSTEM_TIME AS OF PROCTIME() ON a.k = b.k') },
    { a: 'a', b: 'b' });
  assert.deepEqual({ ...tableAliases('SELECT * FROM a JOIN b FOR SYSTEM_TIME AS OF (a.ts - INTERVAL \'1\' SECOND) AS `on` ON 1 = 1') },
    { a: 'a', b: 'b', on: 'b' });
});

test('tableAliases maps a window TVF alias to the table it reads', async () => {
  const { tableAliases, referencedTables } = await load();
  for (const fn of ['TUMBLE', 'HOP', 'CUMULATE', 'SESSION']) {
    const sql = `SELECT s.temp FROM TABLE(${fn}(TABLE sensors, DESCRIPTOR(ts), INTERVAL '1' MINUTE)) s JOIN tanks t ON s.id = t.id`;
    assert.deepEqual({ ...tableAliases(sql) }, { sensors: 'sensors', s: 'sensors', tanks: 'tanks', t: 'tanks' }, fn);
  }
  assert.deepEqual(referencedTables('SELECT * FROM TABLE(TUMBLE(TABLE `cat`.`db`.Orders, DESCRIPTOR(ts), INTERVAL \'1\' MINUTE)) AS w'),
    ['orders']);
  assert.deepEqual({ ...tableAliases('SELECT * FROM TABLE(my_fn(1)) f') }, {});
});

test('columnCandidates offers the columns of every table in a comma-separated FROM list', async () => {
  const { columnCandidates } = await load();
  const tables = [
    { name: 'orders_stream', columns: [{ name: 'order_id', type: 'INT' }] },
    { name: 'shipments', columns: [{ name: 'shipment_id', type: 'INT' }] },
    { name: 'users', columns: [{ name: 'email', type: 'STRING' }] },
  ];
  assert.deepEqual(columnCandidates(INTERVAL_JOIN, tables).map((c) => c.label), ['order_id', 'shipment_id']);
});

test('expectsTableName is true only right after FROM, JOIN, TABLE or INTO', async () => {
  const { expectsTableName } = await load();
  assert.equal(expectsTableName('SELECT * FROM or'), true);
  assert.equal(expectsTableName('SELECT * FROM orders o JOIN '), true);
  assert.equal(expectsTableName('SELECT * FROM orders WHERE re'), false);
  assert.equal(expectsTableName("SELECT 'from x"), false);
});

test('isDdlWithoutQuery ignores comments and strings around CREATE and AS SELECT', async () => {
  const { isDdlWithoutQuery } = await load();
  assert.equal(isDdlWithoutQuery('CREATE TABLE t (id INT, na'), true);
  assert.equal(isDdlWithoutQuery('-- orders\nCREATE TABLE t (id INT, na'), true);
  assert.equal(isDdlWithoutQuery('/* x */ CREATE TABLE t (id INT, na'), true);
  assert.equal(isDdlWithoutQuery('CREATE TABLE t (id INT, -- as select\n na'), true);
  assert.equal(isDdlWithoutQuery('CREATE TABLE t AS SELECT re'), false);
  assert.equal(isDdlWithoutQuery("SELECT 'create' FROM t WHERE re"), false);
});

// Follow-ups from the #59 reviews (issue #60) and the #56 review (issue #57).

const SHOP = [
  { name: 'orders', columns: [{ name: 'user_id', type: 'INT' }, { name: 'region', type: 'STRING' }] },
  { name: 'users', columns: [{ name: 'id', type: 'INT' }, { name: 'email', type: 'STRING' }] },
];

test('the FROM of EXTRACT, TRIM, SUBSTRING, OVERLAY and IS DISTINCT FROM is not a FROM clause', async () => {
  const { referencedTables, columnCandidates, expectsTableName } = await load();
  assert.deepEqual(referencedTables("SELECT EXTRACT(HOUR FROM ts), TRIM(BOTH ' ' FROM name), SUBSTRING(s FROM 1 FOR 2), "
    + 'OVERLAY(s PLACING x FROM 2) FROM orders WHERE a IS DISTINCT FROM b AND c IS NOT DISTINCT FROM d'), ['orders']);
  // Typed before the real FROM: no unknown table hides the columns.
  assert.deepEqual(columnCandidates('SELECT EXTRACT(HOUR FROM ts), re', SHOP).map((c) => c.label),
    ['user_id', 'region', 'id', 'email']);
  assert.deepEqual(columnCandidates('SELECT * FROM orders WHERE a IS DISTINCT FROM re', SHOP).map((c) => c.label),
    ['user_id', 'region']);
  assert.equal(expectsTableName('SELECT EXTRACT(HOUR FROM '), false);
  assert.equal(expectsTableName('SELECT TRIM(LEADING \'x\' FROM na'), false);
  assert.equal(expectsTableName('SELECT * FROM t WHERE a IS NOT DISTINCT FROM '), false);
  assert.equal(expectsTableName('SELECT EXTRACT(HOUR FROM ts) FROM '), true);
});

test('optionCandidates leaves out the keys the WITH clause already sets', async () => {
  const { optionContext, optionCandidates } = await load();
  const keys = optionCandidates(optionContext(
    "CREATE TABLE t (id INT) WITH ('connector' = 'datagen', 'number-of-rows' = '5', 'fields.id.kind' = 'sequence', '"));
  assert.ok(!keys.includes('connector'));
  assert.ok(!keys.includes('number-of-rows'));
  assert.ok(!keys.includes('fields.id.kind'));
  assert.ok(keys.includes('rows-per-second'));
  assert.ok(keys.includes('fields.id.start'));
});

test('qualifierBefore keeps a dot or a doubled backtick inside a backticked qualifier', async () => {
  const { qualifierBefore } = await load();
  assert.deepEqual(qualifierBefore('SELECT `my.tbl`.co'), { qualifier: 'my.tbl', typed: 'co' });
  assert.deepEqual(qualifierBefore('SELECT `a``b`.'), { qualifier: 'a`b', typed: '' });
  assert.deepEqual(qualifierBefore('SELECT o.'), { qualifier: 'o', typed: '' });
  assert.deepEqual(qualifierBefore('SELECT * FROM cat.db.t WHERE t.re'), { qualifier: 't', typed: 're' });
  assert.equal(qualifierBefore('SELECT re'), null);
});

test('a CTE inside CREATE VIEW or CTAS is a query', async () => {
  const { isDdlWithoutQuery } = await load();
  assert.equal(isDdlWithoutQuery('CREATE VIEW v AS WITH x AS (SELECT * FROM orders) SELECT * FROM x WHERE re'), false);
  assert.equal(isDdlWithoutQuery('CREATE TABLE t WITH (\'connector\' = \'print\') AS WITH x AS (SELECT 1) SELECT re'), false);
  assert.equal(isDdlWithoutQuery('CREATE TEMPORARY VIEW v AS (SELECT re'), false);
  assert.equal(isDdlWithoutQuery('CREATE VIEW v AS VALUES (1)'), false);
  // AS ( inside the column list is a computed column.
  assert.equal(isDdlWithoutQuery('CREATE TABLE t (id INT, x AS (id + 1), na'), true);
});

test('a -- inside a backticked nested field name stays in the column type', async () => {
  const { parseCreateTables } = await load();
  assert.deepEqual(parseCreateTables('CREATE TABLE t (r ROW<`a--b` INT>, s STRING /* note */ NOT NULL)')[0].columns, [
    { name: 'r', type: 'ROW<`a--b` INT>', kind: 'physical' },
    { name: 's', type: 'STRING', kind: 'physical' },
  ]);
});

test('OFFSET, FETCH and QUALIFY are not aliases', async () => {
  const { tableAliases } = await load();
  assert.deepEqual({ ...tableAliases('SELECT * FROM orders OFFSET 1') }, { orders: 'orders' });
  assert.deepEqual({ ...tableAliases('SELECT * FROM orders FETCH FIRST 1 ROWS ONLY') }, { orders: 'orders' });
  assert.deepEqual({ ...tableAliases('SELECT * FROM orders QUALIFY ROW_NUMBER() OVER w = 1') }, { orders: 'orders' });
});

test('a block comment inside a qualified table name is not part of the name', async () => {
  const { statementRelations } = await load();
  assert.deepEqual(statementRelations('SELECT * FROM cat./*x*/db.orders o'), [{ table: 'orders', alias: 'o' }]);
  assert.deepEqual(statementRelations('SELECT * FROM cat.db./* t */`page views` p'), [{ table: 'page views', alias: 'p' }]);
});

test('a nested NOT NULL stays inside the column type', async () => {
  const { parseCreateTables, optionContext, optionCandidates } = await load();
  const ddl = 'CREATE TABLE t (addr ROW<city STRING NOT NULL, zip INT> NOT NULL, tags ARRAY<INT NOT NULL>, '
    + 'm ROW<metadata INT>)';
  assert.deepEqual(parseCreateTables(ddl)[0].columns, [
    { name: 'addr', type: 'ROW<city STRING NOT NULL, zip INT>', kind: 'physical' },
    { name: 'tags', type: 'ARRAY<INT NOT NULL>', kind: 'physical' },
    { name: 'm', type: 'ROW<metadata INT>', kind: 'physical' },
  ]);
  const keys = optionCandidates(optionContext(`${ddl} WITH ('connector' = 'faker', 'fields.addr`));
  assert.ok(keys.includes('fields.addr.zip.expression'));
});

test('a backticked table name may be a reserved word', async () => {
  const { tableAliases, referencedTables } = await load();
  assert.deepEqual({ ...tableAliases('SELECT * FROM `table` t JOIN `select` ON 1 = 1') },
    { table: 'table', t: 'table', select: 'select' });
  assert.deepEqual(referencedTables('SELECT * FROM table'), []);
});

test('tableAliases at a position resolves aliases in the query blocks around it', async () => {
  const { tableAliases } = await load();
  const sql = 'SELECT o.region FROM orders o WHERE EXISTS (SELECT 1 FROM users o WHERE o.id = 1) AND o.user_id > 0';
  assert.equal(tableAliases(sql, sql.indexOf('o.region') + 2).o, 'orders');
  assert.equal(tableAliases(sql, sql.indexOf('o.id') + 2).o, 'users');
  assert.equal(tableAliases(sql, sql.indexOf('o.user_id') + 2).o, 'orders');
  // A correlated subquery still sees the outer aliases.
  const correlated = 'SELECT * FROM orders x WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = x.';
  assert.equal(tableAliases(correlated, correlated.length).x, 'orders');
  assert.equal(tableAliases(correlated, correlated.length).u, 'users');
});

test('an alias wins over a table of the same name in the same query', async () => {
  const { tableAliases } = await load();
  assert.deepEqual({ ...tableAliases('SELECT users. FROM orders users JOIN users u ON 1 = 1') },
    { orders: 'orders', users: 'orders', u: 'users' });
});

test('columnCandidates offers the read tables, not the INSERT target, outside its column list', async () => {
  const { columnCandidates, referencedTables } = await load();
  const tables = [
    { name: 'sink', columns: [{ name: 'a', type: 'INT' }, { name: 'b', type: 'INT' }] },
    { name: 'src', columns: [{ name: 'x', type: 'INT' }] },
  ];
  const insert = 'INSERT INTO sink (a, b) SELECT  FROM src';
  assert.deepEqual(columnCandidates(insert, tables, insert.indexOf('SELECT ') + 7).map((c) => c.label), ['x']);
  assert.deepEqual(columnCandidates(insert, tables, insert.indexOf('a, ') + 3).map((c) => c.label), ['a', 'b']);
  const ctas = 'CREATE TABLE sink AS SELECT  FROM src';
  assert.deepEqual(columnCandidates(ctas, tables, ctas.indexOf('SELECT ') + 7).map((c) => c.label), ['x']);
  assert.deepEqual(referencedTables(insert), ['sink', 'src']);
});

test('INSERT INTO t( with no space and no ) yet reads its target', async () => {
  const { columnCandidates, referencedTables } = await load();
  const tables = [{ name: 'sink', columns: [{ name: 'a', type: 'INT' }, { name: 'b', type: 'INT' }] }, ...SHOP];
  assert.deepEqual(referencedTables('INSERT INTO sink(a, '), ['sink']);
  assert.deepEqual(columnCandidates('INSERT INTO sink(a, ', tables).map((c) => c.label), ['a', 'b']);
});

test('a temporal join alias without AS is read, and the FROM list goes on after a temporal item', async () => {
  const { tableAliases, statementRelations } = await load();
  assert.deepEqual({ ...tableAliases('SELECT * FROM o JOIN fx FOR SYSTEM_TIME AS OF o.ts r ON o.k = r.k') },
    { o: 'o', fx: 'fx', r: 'fx' });
  assert.deepEqual({ ...tableAliases("SELECT * FROM o JOIN fx FOR SYSTEM_TIME AS OF o.ts - INTERVAL '1' SECOND r ON 1 = 1") },
    { o: 'o', fx: 'fx', r: 'fx' });
  assert.deepEqual({ ...tableAliases('SELECT * FROM o JOIN fx FOR SYSTEM_TIME AS OF PROCTIME() r ON 1 = 1') },
    { o: 'o', fx: 'fx', r: 'fx' });
  assert.deepEqual(statementRelations('SELECT * FROM a FOR SYSTEM_TIME AS OF PROCTIME(), b y WHERE 1 = 1'),
    [{ table: 'a', alias: null }, { table: 'b', alias: 'y' }]);
});

test('a named-argument window TVF maps its alias to the table it reads', async () => {
  const { tableAliases } = await load();
  assert.deepEqual({ ...tableAliases("SELECT s. FROM TABLE(TUMBLE(DATA => TABLE sensors, TIMECOL => DESCRIPTOR(ts), "
    + "SIZE => INTERVAL '1' MINUTE)) s") }, { sensors: 'sensors', s: 'sensors' });
  assert.deepEqual({ ...tableAliases('SELECT * FROM TABLE(HOP(TIMECOL => DESCRIPTOR(ts), DATA => TABLE `cat`.`db`.sensors, '
    + "SLIDE => INTERVAL '1' MINUTE, SIZE => INTERVAL '5' MINUTE)) AS h") }, { sensors: 'sensors', h: 'sensors' });
});

test('option values are offered only for keys the declared connector accepts', async () => {
  const { optionContext, optionCandidates } = await load();
  const values = (connector, key) => optionCandidates(optionContext(
    `CREATE TABLE t (id INT) WITH ('connector' = '${connector}', '${key}' = '`));
  assert.deepEqual(values('datagen', 'fields.id.kind'), ['random', 'sequence']);
  assert.deepEqual(values('faker', 'fields.id.kind'), []);
  assert.deepEqual(values('print', 'standard-error'), ['true', 'false']);
  assert.deepEqual(values('datagen', 'standard-error'), []);
  assert.deepEqual(values('datagen', 'fields.nope.kind'), []);
});

test('an apostrophe in a column name is doubled in the option text', async () => {
  const { optionContext, optionCandidates, sqlStringText } = await load();
  const ddl = "CREATE TABLE t (`a'b` INT) WITH ('connector' = 'datagen', ";
  assert.ok(optionCandidates(optionContext(`${ddl}'f`)).includes("fields.a'b.kind"));
  assert.equal(sqlStringText("fields.a'b.kind"), "fields.a''b.kind");
  // A key written with the doubled apostrophe reads back as the column's option.
  const ctx = optionContext(`${ddl}'fields.a''b.kind' = '`);
  assert.equal(ctx.key, "fields.a'b.kind");
  assert.deepEqual(optionCandidates(ctx), ['random', 'sequence']);
  assert.ok(!optionCandidates(optionContext(`${ddl}'fields.a''b.kind' = 'random', '`)).includes("fields.a'b.kind"));
});

test('a table named __proto__ completes like any other table (#57)', async () => {
  const { columnCandidates, mergeTables, tableAliases } = await load();
  const proto = { name: '__proto__', columns: [{ name: 'x', type: 'INT' }] };
  const merged = mergeTables([proto], SHOP);
  assert.deepEqual(merged.map((t) => t.name), ['__proto__', 'orders', 'users']);
  assert.deepEqual(columnCandidates('SELECT  FROM __proto__', merged).map((c) => c.label), ['x']);
  assert.equal(tableAliases('SELECT p. FROM __proto__ p', 9).p, '__proto__');
});
