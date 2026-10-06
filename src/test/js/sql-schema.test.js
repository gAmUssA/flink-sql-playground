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
  assert.deepEqual(ctx.columns, ['id', 'name']);
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
    { kind: 'key', key: null, typed: 'fie', connector: 'faker', columns: ['id', 'name'] });
  assert.deepEqual(optionContext("CREATE TABLE t (id INT) WITH ('connector' = 'da"),
    { kind: 'value', key: 'connector', typed: 'da', connector: null, columns: ['id'] });
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
  assert.deepEqual(ctx.columns, ['id', 'note']);
});

test('optionCandidates expands per-column options for the declared connector', async () => {
  const { optionCandidates } = await load();
  assert.deepEqual(optionCandidates({ kind: 'key', connector: 'faker', columns: ['id'] }),
    ['connector', 'number-of-rows', 'rows-per-second', 'fields.id.expression', 'fields.id.null-rate', 'fields.id.length']);
  assert.deepEqual(optionCandidates({ kind: 'key', connector: null, columns: ['id'] }), ['connector']);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'connector' }), ['datagen', 'faker', 'print', 'blackhole']);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'fields.id.kind' }), ['random', 'sequence']);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'number-of-rows' }), []);
  assert.deepEqual(optionCandidates(null), []);
  for (const connector of ['constructor', '__proto__', 'toString']) {
    assert.deepEqual(optionCandidates({ kind: 'key', connector, columns: [] }), ['connector']);
  }
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'constructor' }), []);
  assert.deepEqual(optionCandidates({ kind: 'value', key: 'fields.id.__proto__' }), []);
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
