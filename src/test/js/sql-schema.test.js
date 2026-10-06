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
});

test('tableAliases maps aliases and table names, ignoring clause keywords', async () => {
  const { tableAliases } = await load();
  const plain = (sql) => ({ ...tableAliases(sql) });
  assert.deepEqual(plain('SELECT * FROM orders o JOIN users AS u ON o.id = u.id WHERE 1 = 1'),
    { orders: 'orders', o: 'orders', users: 'users', u: 'users' });
  assert.deepEqual(plain('SELECT * FROM Orders WHERE x = 1'), { orders: 'Orders' });
  assert.equal(tableAliases('SELECT * FROM __proto__ p').__proto__, '__proto__');
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
