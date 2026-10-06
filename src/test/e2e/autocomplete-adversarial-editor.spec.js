'use strict';
// Tester acceptance probes for schema-aware autocomplete (PR #59): adversarial inputs the PR's
// own tests do not cover. Text is placed with a dispatch (no keystroke timing), completion is
// opened explicitly, and each probe reads the popup once completion has settled.
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');
const { setEditorText, explicitSuggestions } = require('./completion');

const DDL = [
  '-- CREATE TABLE ghost (gx INT)',
  '/* CREATE TABLE ghost2 (gy INT) */',
  "CREATE TABLE trades (trade_id BIGINT, venue STRING, `my col` STRING, note STRING COMMENT 'CREATE TABLE fake (fz INT)') WITH ('connector' = 'datagen');",
  "CREATE TABLE `page views` (url STRING) WITH ('connector' = 'faker');",
  "CREATE TABLE users (uid INT, email STRING) WITH ('connector' = 'faker');",
].join('\n');

async function open(page, { build = false } = {}) {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
  if (build) {
    await page.locator('#build-schema-btn').click();
    await expect(page.locator('.tbl-card[data-table="orders"]')).toBeVisible();
  }
}

/** Labels in the completion popup after Ctrl+Space at the `|` in `text`, once settled; [] when none opens. */
const complete = explicitSuggestions;

/** Puts `ddl` in the Schema editor and waits until the query editor offers `table` (a 250 ms debounce). */
async function withSchema(page, ddl, table) {
  await setEditorText(page, 'schema', ddl);
  await expect.poll(() => complete(page, 'query', 'SELECT * FROM |')).toContain(table);
}

test('names inside comments and strings of the Schema editor declare no table or column', async ({ page }) => {
  await open(page);
  await withSchema(page, DDL, 'trades');
  const labels = await complete(page, 'query', 'SELECT g|');
  for (const name of ['ghost', 'ghost2', 'gx', 'gy']) expect.soft(labels).not.toContain(name);
  expect.soft(await complete(page, 'query', 'SELECT f|')).not.toContain('fz');
  expect.soft(await complete(page, 'query', 'SELECT * FROM fa|')).not.toContain('fake');
});

test('no table or column names inside a query string or comment', async ({ page }) => {
  await open(page, { build: true });
  expect.soft(await complete(page, 'query', "SELECT 'reg|'")).not.toContain('region');
  expect.soft(await complete(page, 'query', 'SELECT 1 -- reg|')).not.toContain('region');
  expect.soft(await complete(page, 'query', 'SELECT /* reg| */ 1')).not.toContain('region');
});

test('a comment after or inside a WITH clause', async ({ page }) => {
  await open(page);
  expect.soft(await complete(page, 'schema', "CREATE TABLE t (id INT) WITH ('connector' = 'datagen') -- 'fields.|"))
    .not.toContain('fields.id.kind');
  const keys = await complete(page, 'schema', "CREATE TABLE t (id INT) WITH ( -- the user's options\n  'connector' = 'datagen',\n  'fields.|");
  expect.soft(keys).toContain('fields.id.kind');
});

test('backticked and qualified table names', async ({ page }) => {
  await open(page);
  await withSchema(page, DDL, 'trades');
  expect.soft((await complete(page, 'query', 'SELECT * FROM `trades` t WHERE t.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT `trades`.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT * FROM cat.db.trades x WHERE x.ven|'))[0]).toBe('venue');
  expect.soft(await complete(page, 'query', 'SELECT `page views`.|')).toEqual(['url']);
  expect.soft(await complete(page, 'query', 'SELECT * FROM TRADES WHERE trades.|')).toContain('my col');
});

test('a second statement after ; uses its own tables', async ({ page }) => {
  await open(page);
  await withSchema(page, DDL, 'trades');
  const second = await complete(page, 'query', 'SELECT * FROM users; SELECT * FROM trades WHERE |');
  expect.soft(second).toContain('venue');
  expect.soft(second).not.toContain('email');
  expect.soft(await complete(page, 'query', 'SELECT * FROM trades; SELECT em|')).toContain('email');
  const opts = await complete(page, 'schema',
    "CREATE TABLE a (x INT) WITH ('connector' = 'datagen'); CREATE TABLE b (y INT) WITH ('connector' = 'datagen', 'fields.|");
  expect.soft(opts).toContain('fields.y.kind');
  expect.soft(opts).not.toContain('fields.x.kind');
});

test('an alias named like a keyword', async ({ page }) => {
  await open(page);
  await withSchema(page, DDL, 'trades');
  expect.soft((await complete(page, 'query', 'SELECT * FROM trades value WHERE value.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT * FROM trades AS `order` WHERE `order`.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT * FROM trades `select` WHERE `select`.ven|'))[0]).toBe('venue');
});

test('very long DDL stays correct', async ({ page }) => {
  await open(page);
  const cols = Array.from({ length: 300 }, (_, i) => `c${i} STRING`).join(',\n  ');
  await withSchema(page, `CREATE TABLE wide (\n  ${cols}\n) WITH ('connector' = 'datagen');`, 'wide');
  const labels = await complete(page, 'query', 'SELECT * FROM wide WHERE c29|');
  expect.soft(labels.slice(0, 11)).toEqual(['c29', 'c290', 'c291', 'c292', 'c293', 'c294', 'c295', 'c296', 'c297', 'c298', 'c299']);
  const keys = await complete(page, 'schema', `CREATE TABLE wide (\n  ${cols}\n) WITH ('connector' = 'datagen', 'fields.c299.k|`);
  expect.soft(keys).toEqual(['fields.c299.kind']);
});

test('keywords still complete and built tables win over the draft', async ({ page }) => {
  await open(page);
  expect.soft(await complete(page, 'query', 'SEL|')).toContain('SELECT');
  // Draft: the first example declares orders (user_id, amount); the stub server builds orders with region.
  expect.soft(await complete(page, 'query', 'SELECT * FROM orders WHERE am|')).toContain('amount');
  await page.locator('#build-schema-btn').click();
  await expect(page.locator('.tbl-card[data-table="orders"]')).toBeVisible();
  const after = await complete(page, 'query', 'SELECT * FROM orders WHERE |');
  expect.soft(after).toContain('region');
  expect.soft(after).not.toContain('amount');
});
