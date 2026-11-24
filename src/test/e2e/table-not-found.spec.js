'use strict';
// A query naming a table the session does not have (API code TABLE_NOT_FOUND, stubbed by
// "-- stub: table not found NAME" in stub-api.js until a CREATE of NAME has run) explains itself:
// declared in the schema editor but not built offers "Build Schema and run"; not declared says
// there is no such table. Flink's own message stays underneath.
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');
const { measureContrast, settleAnimations } = require('./contrast');

const ready = (page) => page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
const NF = '#results-container .rv-nf';

async function open(page, { theme } = {}) {
  await stubApi(page);
  if (theme) await page.addInitScript((t) => localStorage.setItem('fsf-tweaks-v2', JSON.stringify({ theme: t, themeExplicit: true })), theme);
  await page.goto('/');
  await ready(page);
}

/** Every SQL statement POSTed to /execute or /execute/stream, in order. */
function executed(page) {
  const seen = [];
  page.on('request', (r) => { if (/\/execute(\/stream)?$/.test(r.url())) seen.push(JSON.parse(r.postData()).sql); });
  return seen;
}

async function run(page, sql, mode = 'BATCH') {
  await page.evaluate((q) => queryEditor.setValue(q), sql);
  await page.click(`#mode-segmented [data-mode="${mode}"]`);
  await page.click('#run-query-btn');
}

const missingOrders = '-- stub: table not found orders\nSELECT * FROM orders';

test('first visit: Run Query before Build Schema says to build, and the button builds and reruns', async ({ page }) => {
  await open(page);
  const sql = executed(page);
  await run(page, missingOrders);
  const nf = page.locator(NF);
  await expect(nf.locator('.rv-empty-label')).toHaveText('Table orders isn’t built yet');
  await expect(nf.locator('.rv-nf-name')).toHaveText('orders');
  await expect(nf.locator('.rv-nf-hint')).toContainText('The schema editor declares it');
  await expect(nf.locator('.rv-nf-detail')).toHaveText("Flink: SQL validation failed. From line 2, column 15 to line 2, column 20: Object 'orders' not found");
  await expect(nf).toHaveAttribute('data-missing-table', 'orders');

  await nf.getByRole('button', { name: 'Build Schema and run' }).click();
  await expect(page.locator('.rv-table')).toBeVisible();
  await expect(page.locator(NF)).toHaveCount(0);
  expect(sql.map((s) => s.split('\n')[0])).toEqual(['-- stub: table not found orders', 'CREATE TEMPORARY TABLE orders (', '-- stub: table not found orders']);
});

test('a streaming run names the missing table too', async ({ page }) => {
  await open(page);
  await run(page, missingOrders, 'STREAMING');
  await expect(page.locator(`${NF} .rv-empty-label`)).toHaveText('Table orders isn’t built yet');
  await page.locator(`${NF} [data-nf-build]`).click();
  await expect(page.locator('.rv-table')).toBeVisible();
});

test('a table the schema editor does not declare: no such table, check the spelling, no build button', async ({ page }) => {
  await open(page);
  await run(page, '-- stub: table not found ordrs\nSELECT * FROM ordrs');
  const nf = page.locator(NF);
  await expect(nf.locator('.rv-empty-label')).toHaveText('No table named ordrs');
  await expect(nf.locator('.rv-nf-hint')).toHaveText('Check the name for a typo, or declare the table with CREATE TABLE in the schema editor and build the schema.');
  await expect(nf.locator('[data-nf-build]')).toHaveCount(0);
  await expect(nf.locator('.rv-nf-detail')).toContainText("Object 'ordrs' not found");
});

test('a name that differs only in case points at the right spelling', async ({ page }) => {
  await open(page);
  // Not built: Flink has nothing to suggest, the schema editor does.
  await run(page, '-- stub: table not found ORDERS\nSELECT * FROM ORDERS');
  await expect(page.locator(`${NF} .rv-empty-label`)).toHaveText('No table named ORDERS');
  await expect(page.locator(`${NF} .rv-nf-hint`)).toHaveText('The schema editor declares orders. Table names are case-sensitive: use that spelling, and build the schema.');
  // Built: Flink's own "did you mean" wins.
  await run(page, '-- stub: table not found Orders\n-- stub: did you mean orders\nSELECT * FROM Orders');
  await expect(page.locator(`${NF} .rv-nf-hint`)).toHaveText('Did you mean orders? Table names are case-sensitive.');
});

test('a schema that fails to build says why, keeps the button and its focus, and does not run', async ({ page }) => {
  await open(page);
  await page.evaluate(() => schemaEditor.setValue('-- stub: build fails\nCREATE TEMPORARY TABLE orders (id INT) WITH (\'connector\' = \'datagen\')'));
  const sql = executed(page);
  await run(page, missingOrders);
  const btn = page.locator(`${NF} [data-nf-build]`);
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`${NF} .rv-nf-fail`)).toHaveText('The schema didn’t build: Could not execute CreateTable in path `orders`');
  await expect(page.locator(`${NF} .rv-nf-fail`)).toHaveAttribute('role', 'alert');
  await expect(btn).toBeFocused();
  await expect(btn).toHaveText(/Build Schema and run/);
  expect(sql.filter((s) => s.includes('SELECT * FROM orders'))).toHaveLength(1);

  // Fixed and built with the toolbar button: the failure note goes away.
  await page.evaluate(() => schemaEditor.setValue('CREATE TEMPORARY TABLE orders (id INT) WITH (\'connector\' = \'datagen\')'));
  await page.click('#build-schema-btn');
  await expect(page.locator(`${NF} .rv-nf-fail`)).toHaveCount(0);
});

test('a failed build from the toolbar shows on a missing-table state too', async ({ page }) => {
  await open(page);
  await page.evaluate(() => schemaEditor.setValue('-- stub: build fails\nCREATE TEMPORARY TABLE orders (id INT) WITH (\'connector\' = \'datagen\')'));
  await run(page, missingOrders);
  await page.click('#build-schema-btn');
  await expect(page.locator(`${NF} .rv-nf-fail`)).toHaveText('The schema didn’t build: Could not execute CreateTable in path `orders`');
});

test('double clicks build once and run once', async ({ page }) => {
  await open(page);
  // Slow the build down so the second click lands while it runs.
  await page.route('**/api/sessions/*/execute', async (route) => {
    if (/CREATE/.test(route.request().postData() || '')) await new Promise((r) => setTimeout(r, 400));
    await route.fallback();
  });
  await run(page, missingOrders);
  const sql = executed(page);
  const btn = page.locator(`${NF} [data-nf-build]`);
  await btn.dblclick();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  await expect(btn).toHaveText(/Building schema…/);
  await btn.click({ force: true });
  await expect(page.locator('.rv-table')).toBeVisible();
  expect(sql.map((s) => s.split('\n')[0])).toEqual(['CREATE TEMPORARY TABLE orders (', '-- stub: table not found orders']);
});

// Holds every CREATE (Build Schema) for `ms`, so a test can act while the schema builds.
async function slowBuild(page, ms = 800) {
  await page.route('**/api/sessions/*/execute', async (route) => {
    if (/CREATE/.test(route.request().postData() || '')) await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

test('a query edited while the schema builds is not run: the build finishes, the button comes back', async ({ page }) => {
  await open(page);
  await slowBuild(page);
  await run(page, missingOrders);
  const sql = executed(page);
  const btn = page.locator(`${NF} [data-nf-build]`);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  // The new text is an INSERT: running it was never asked for.
  await page.evaluate(() => queryEditor.setValue('INSERT INTO sink SELECT * FROM orders'));
  await expect(page.locator('#status-text')).toHaveText('Schema built. The query or mode changed while it built, so it was not run.');
  await expect(btn).toHaveText(/Build Schema and run/);
  await expect(btn).not.toHaveAttribute('aria-busy', 'true');
  expect(sql.map((s) => s.split('\n')[0])).toEqual(['CREATE TEMPORARY TABLE orders (']);
});

test('a mode switched while the schema builds is not run either', async ({ page }) => {
  await open(page);
  await slowBuild(page);
  await run(page, missingOrders, 'BATCH');
  const sql = executed(page);
  await page.locator(`${NF} [data-nf-build]`).click();
  await page.click('#mode-segmented [data-mode="STREAMING"]');
  await expect(page.locator('#status-text')).toHaveText('Schema built. The query or mode changed while it built, so it was not run.');
  expect(sql.filter((s) => s.includes('SELECT * FROM orders'))).toEqual([]);
});

test('a query someone else started while the schema builds keeps running: the build does not stop or rerun it', async ({ page }) => {
  await open(page);
  await slowBuild(page);
  await run(page, missingOrders, 'STREAMING');
  const sql = executed(page);
  await page.locator(`${NF} [data-nf-build]`).click();
  // Another query starts (and stays live for 1.5 s), then the editor goes back to the clicked one.
  await page.evaluate(() => queryEditor.setValue('-- stub: slow\nSELECT 2'));
  await page.click('#run-query-btn');
  await expect(page.locator('#run-query-btn')).toHaveClass(/is-running/);
  await page.evaluate((q) => queryEditor.setValue(q), missingOrders);
  await expect(page.locator('#status-text')).toHaveText('Schema built. Another query is running, so the query was not run.');
  await expect(page.locator('#run-query-btn')).toHaveClass(/is-running/);
  await expect(page.locator('#run-query-btn')).not.toHaveClass(/is-running/);
  expect(sql.map((s) => s.split('\n')[0])).toEqual(['CREATE TEMPORARY TABLE orders (', '-- stub: slow']);
});

test('a qualified name the schema editor declares elsewhere is a different table, with no build button', async ({ page }) => {
  await open(page);
  // The schema editor declares orders in the default database; the query reads other_db.orders.
  await run(page, '-- stub: table not found other_db.orders\nSELECT * FROM other_db.orders');
  const nf = page.locator(NF);
  await expect(nf.locator('.rv-empty-label')).toHaveText('No table named other_db.orders');
  await expect(nf.locator('.rv-nf-hint')).toHaveText('The schema editor declares orders, which is a different table. Building the schema won’t create other_db.orders: check the database name.');
  await expect(nf.locator('[data-nf-build]')).toHaveCount(0);
  // Fully qualified in the default database: the same table as the declared orders.
  await run(page, '-- stub: table not found default_catalog.default_database.orders\nSELECT * FROM default_catalog.default_database.orders');
  await expect(nf.locator('.rv-empty-label')).toHaveText('Table orders isn’t built yet');
  await expect(nf.locator('[data-nf-build]')).toHaveCount(1);
});

test('a session that has ended says to reload instead of building into nothing', async ({ page }) => {
  await open(page);
  await run(page, missingOrders);
  await page.route('**/api/sessions/*/execute', (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Session not found: test-session', code: 'SESSION_NOT_FOUND' }),
  }));
  await page.locator(`${NF} [data-nf-build]`).click();
  await expect(page.locator(`${NF} .rv-nf-fail`)).toHaveText('The schema didn’t build: this session has ended. Reload the page to start a new one.');
});

test('the Job Graph tab opened before building explains the same way and builds from there', async ({ page }) => {
  await open(page);
  await page.evaluate((q) => queryEditor.setValue(q), missingOrders);
  await page.click('.rtab[data-tab="graph"]');
  const nf = page.locator(NF);
  await expect(nf.locator('.rv-empty-label')).toHaveText('Table orders isn’t built yet');
  await expect(nf.locator('.rv-nf-detail')).toContainText("Object 'orders' not found");
  await nf.locator('[data-nf-build]').click();
  await expect(page.locator('.pg-node').first()).toBeVisible();
});

test('the Timeline tab explains a missing table and keeps its record button when nothing is declared', async ({ page }) => {
  await open(page);
  await page.click('#mode-segmented [data-mode="STREAMING"]');
  await page.evaluate(() => queryEditor.setValue('-- stub: table not found clickz\nSELECT * FROM clickz'));
  await page.click('.rtab[data-tab="timeline"]');
  await page.click('#timeline-record-btn');
  const nf = page.locator(NF);
  await expect(nf.locator('.rv-empty-label')).toHaveText('No table named clickz');
  await expect(nf.locator('#timeline-record-btn')).toBeVisible();
  await expect(nf.locator('[data-nf-build]')).toHaveCount(0);

  // Declared: the build button runs the query, which records the timeline on this tab.
  await page.evaluate((q) => queryEditor.setValue(q), missingOrders);
  await page.click('#timeline-record-btn');
  await expect(nf.locator('.rv-empty-label')).toHaveText('Table orders isn’t built yet');
  await expect(nf.locator('#timeline-record-btn')).toHaveCount(0);
  await nf.locator('[data-nf-build]').click();
  await expect(page.locator('.wt-dot').first()).toBeVisible();
});

test('a table name is text, never markup', async ({ page }) => {
  await open(page);
  const evil = '<img src=x onerror="window.__pwned=1">';
  await run(page, `-- stub: table not found ${evil}\nSELECT 1`);
  await expect(page.locator(`${NF} .rv-nf-name`)).toHaveText(evil);
  await expect(page.locator(NF)).toHaveAttribute('data-missing-table', evil);
  await expect(page.locator(`${NF} img`)).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

// A DROP of a missing object (API code OBJECT_NOT_FOUND) shows Flink's message and nothing to build:
// rebuilding the schema cannot make a DROP succeed, even when the schema editor declares the name.
for (const mode of ['BATCH', 'STREAMING']) {
  test(`${mode}: DROP of a missing table shows Flink's message, with no build offer and no internal error`, async ({ page }) => {
    await open(page);
    const sql = executed(page);
    // "orders" is declared in the schema editor: a TABLE_NOT_FOUND would offer to build it.
    await run(page, 'DROP TABLE orders', mode);
    const empty = page.locator('#results-container .rv-empty');
    await expect(empty.locator('.rv-empty-label')).toHaveText('Query failed');
    await expect(empty.locator('.rv-empty-hint')).toHaveText("Table with identifier 'default_catalog.default_database.orders' does not exist.");
    await expect(page.locator(NF)).toHaveCount(0);
    await expect(page.locator('[data-nf-build]')).toHaveCount(0);
    await expect(page.locator('#results-container')).not.toContainText(/internal/i);
    await expect(page.locator('#results-container')).not.toContainText('Build Schema');
    expect(sql).toEqual(['DROP TABLE orders']);
  });
}

test('a view dropped as TABLE shows the hint after Flink\'s message', async ({ page }) => {
  await open(page);
  await run(page, '-- stub: drop is view\nDROP TABLE v');
  await expect(page.locator('#results-container .rv-empty-hint'))
    .toHaveText("Table with identifier 'default_catalog.default_database.v' does not exist. Use DROP VIEW to drop a view.");
});

test('dropping a built table twice: the first succeeds, the second says it does not exist', async ({ page }) => {
  await open(page);
  await run(page, 'CREATE TABLE x (id INT) WITH (\'connector\' = \'datagen\')');
  await run(page, 'DROP TABLE x');
  await expect(page.locator('#results-container .rv-empty.is-error')).toHaveCount(0);
  await run(page, 'DROP TABLE x');
  await expect(page.locator('#results-container .rv-empty-hint'))
    .toHaveText("Table with identifier 'default_catalog.default_database.x' does not exist.");
});

test('DROP ... IF EXISTS of a missing table still succeeds', async ({ page }) => {
  await open(page);
  await run(page, 'DROP TABLE IF EXISTS orders');
  await expect(page.locator('#results-container .rv-empty.is-error')).toHaveCount(0);
});

for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme}: the failed-DROP message reaches 4.5:1`, async ({ page }) => {
    await open(page, { theme });
    await run(page, 'DROP TABLE orders');
    await expect(page.locator('#results-container .rv-empty-hint')).toBeVisible();
    await settleAnimations(page);
    const results = await page.evaluate((fn) => new Function(`return (${fn})`)()(
      ['.rv-empty-label', '.rv-empty-hint']
        .map((sel) => ({ what: sel, el: document.querySelector(`#results-container .rv-empty ${sel}`) }))), measureContrast.toString());
    expect(results.filter((m) => m.ratio < 4.5), `${theme}: text below 4.5:1`).toEqual([]);
  });
}

for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme}: the missing-table state reaches 4.5:1`, async ({ page }) => {
    await open(page, { theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => schemaEditor.setValue('-- stub: build fails\nCREATE TEMPORARY TABLE orders (id INT) WITH (\'connector\' = \'datagen\')'));
    await run(page, missingOrders);
    await page.locator(`${NF} [data-nf-build]`).click();
    await expect(page.locator(`${NF} .rv-nf-fail`)).toBeVisible();
    await settleAnimations(page);
    const results = await page.evaluate((fn) => new Function(`return (${fn})`)()(
      ['.rv-empty-label', '.rv-nf-name', '.rv-nf-hint', '[data-nf-build]', '.rv-nf-fail', '.rv-nf-detail', '.rv-nf-detail-k']
        .map((sel) => ({ what: sel, el: document.querySelector(`#results-container .rv-nf ${sel}`) }))), measureContrast.toString());
    expect(results.filter((m) => m.ratio < 4.5), `${theme}: text below 4.5:1`).toEqual([]);
  });
}
