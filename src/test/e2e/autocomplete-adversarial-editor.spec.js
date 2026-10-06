'use strict';
// Tester acceptance probes for schema-aware autocomplete (PR #59): adversarial inputs the PR's
// own tests do not cover. Text is placed with a dispatch (no keystroke timing) and completion
// is opened explicitly, so each probe reads a settled popup.
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');

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

async function setText(page, editor, textWithCursor) {
  const pos = textWithCursor.indexOf('|');
  const text = pos === -1 ? textWithCursor : textWithCursor.replace('|', '');
  await page.evaluate(({ editor, text, pos }) => {
    const ed = editor === 'schema' ? schemaEditor : queryEditor;
    ed.view.dispatch({ changes: { from: 0, to: ed.view.state.doc.length, insert: text },
      selection: { anchor: pos === -1 ? text.length : pos } });
    ed.view.focus();
  }, { editor, text, pos });
}

/** Labels in the completion popup after Ctrl+Space at the `|` in `text`; [] when none opens. */
async function complete(page, editor, text) {
  await page.keyboard.press('Escape');
  await setText(page, editor, text);
  await page.keyboard.press('Control+Space');
  await page.waitForTimeout(350);
  return page.locator('.cm-tooltip-autocomplete li .cm-completionLabel').allInnerTexts();
}

async function withSchema(page, ddl) {
  await setText(page, 'schema', ddl);
  await page.waitForTimeout(400); // the editors pick up Schema editor tables after a 250 ms debounce
}

test('names inside comments and strings of the Schema editor declare no table or column', async ({ page }) => {
  await open(page);
  await withSchema(page, DDL);
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
  await withSchema(page, DDL);
  expect.soft((await complete(page, 'query', 'SELECT * FROM `trades` t WHERE t.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT `trades`.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT * FROM cat.db.trades x WHERE x.ven|'))[0]).toBe('venue');
  expect.soft(await complete(page, 'query', 'SELECT `page views`.|')).toEqual(['url']);
  expect.soft(await complete(page, 'query', 'SELECT * FROM TRADES WHERE trades.|')).toContain('my col');
});

test('a second statement after ; uses its own tables', async ({ page }) => {
  await open(page);
  await withSchema(page, DDL);
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
  await withSchema(page, DDL);
  expect.soft((await complete(page, 'query', 'SELECT * FROM trades value WHERE value.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT * FROM trades AS `order` WHERE `order`.ven|'))[0]).toBe('venue');
  expect.soft((await complete(page, 'query', 'SELECT * FROM trades `select` WHERE `select`.ven|'))[0]).toBe('venue');
});

test('very long DDL stays correct and responsive', async ({ page }) => {
  await open(page);
  const cols = Array.from({ length: 300 }, (_, i) => `c${i} STRING`).join(',\n  ');
  await withSchema(page, `CREATE TABLE wide (\n  ${cols}\n) WITH ('connector' = 'datagen');`);
  const t0 = Date.now();
  const labels = await complete(page, 'query', 'SELECT * FROM wide WHERE c29|');
  expect.soft(labels.slice(0, 11)).toEqual(['c29', 'c290', 'c291', 'c292', 'c293', 'c294', 'c295', 'c296', 'c297', 'c298', 'c299']);
  expect.soft(Date.now() - t0).toBeLessThan(1500);
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
