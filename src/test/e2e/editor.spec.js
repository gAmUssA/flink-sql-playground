'use strict';
// The CodeMirror SQL editors on desktop: run shortcut, schema autocomplete, theme colours,
// the getValue/setValue paths (presets, share links) and same-origin loading.
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');
const { setEditorText, settledLabels, suggestions } = require('./completion');

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openApp(page) {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
  await expect(page.locator('#status-session')).toContainText('session');
  await page.locator('#build-schema-btn').click();
  await expect(page.locator('.tbl-card[data-table="orders"]')).toBeVisible();
}

async function replaceQuery(page, text) {
  await page.locator('#query-editor .cm-content').click();
  await page.keyboard.press(`${MOD}+A`);
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

test('loads only same-origin scripts and no jsDelivr request', async ({ page }) => {
  const external = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.hostname !== '127.0.0.1' && !url.hostname.endsWith('fonts.googleapis.com')
      && !url.hostname.endsWith('fonts.gstatic.com')) external.push(r.url());
  });
  await openApp(page);
  expect(external).toEqual([]);
});

test('Ctrl/Cmd+Enter in the query editor runs the query', async ({ page }) => {
  await openApp(page);
  await page.locator('#mode-segmented [data-mode="BATCH"]').click();
  let executed = null;
  page.on('request', (r) => { if (/\/execute$/.test(r.url())) executed = JSON.parse(r.postData()).sql; });
  await replaceQuery(page, 'SELECT user_id FROM orders');
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.locator('.rv-table')).toBeVisible();
  expect(executed).toBe('SELECT user_id FROM orders');
  // The shortcut runs instead of inserting a line.
  expect(await page.evaluate(() => document.querySelectorAll('#query-editor .cm-line').length)).toBe(1);
});

test('typing suggests built tables and their columns, with or without the table prefix', async ({ page }) => {
  await openApp(page);
  await expect.poll(() => suggestions(page, 'query', 'SELECT * FROM ord')).toContain('orders');
  await expect.poll(async () => (await suggestions(page, 'query', 'SELECT reg'))[0]).toBe('region');
  await expect.poll(async () => (await suggestions(page, 'query', 'SELECT * FROM orders WHERE stat'))[0]).toBe('status');
  await expect.poll(async () => (await suggestions(page, 'query', 'SELECT orders.reg'))[0]).toBe('region');
  await expect.poll(async () => (await suggestions(page, 'query', 'SELECT * FROM orders o WHERE o.reg'))[0]).toBe('region');
  expect(await suggestions(page, 'query', "SELECT 'reg")).not.toContain('region');
});

test('tables declared in the Schema editor complete before Build Schema', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
  await setEditorText(page, 'schema', 'CREATE TABLE trades (trade_id BIGINT, venue STRING)');
  // The editors pick up Schema editor tables after a debounce.
  await expect.poll(() => suggestions(page, 'query', 'SELECT * FROM tra')).toContain('trades');
  await expect.poll(async () => (await suggestions(page, 'query', 'SELECT ven'))[0]).toBe('venue');
});

test('the Schema editor suggests connectors and their per-column options', async ({ page }) => {
  await openApp(page);
  await expect.poll(() => suggestions(page, 'schema', "CREATE TABLE t (id INT, name STRING) WITH ('connector' = 'fa"))
    .toEqual(['faker']);
  const keys = await suggestions(page, 'schema', "CREATE TABLE t (id INT, name STRING) WITH ('connector' = 'faker', 'fields.n");
  expect(keys).toContain('fields.name.expression');
  expect(keys).not.toContain('fields.name.min'); // a datagen option
  await expect.poll(() => suggestions(page, 'schema', "CREATE TABLE t (id INT) WITH ('connector' = 'datagen', 'fields.id.kind' = '"))
    .toEqual(['random', 'sequence']);
});

test('the Interval Join preset offers shipments columns after s.', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
  const index = await page.evaluate(() => EXAMPLES.findIndex((e) => e.title === 'Interval Join'));
  await page.locator('#example-select').selectOption(String(index));
  const query = await page.evaluate((i) => EXAMPLES[i].query, index);
  // FROM orders_stream o, shipments s: the cursor goes right after the first s.
  await expect.poll(async () => {
    await setEditorText(page, 'query', query.replace('s.shipment_id', 's.|'), { typed: true });
    return settledLabels(page, 'query');
  }).toEqual(['order_ref', 'ship_time', 'shipment_id']);
});

test('accepting a table name that needs quoting inserts it in backticks', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
  await setEditorText(page, 'schema', "CREATE TABLE `page views` (url STRING) WITH ('connector' = 'faker');");
  await expect.poll(() => suggestions(page, 'query', 'SELECT * FROM pa')).toContain('page views');
  await page.locator('.cm-tooltip-autocomplete li', { has: page.locator('.cm-completionLabel', { hasText: /^page views$/ }) })
    .click();
  await expect.poll(() => page.evaluate(() => queryEditor.getValue())).toBe('SELECT * FROM `page views`');
});

test('Flink keywords are highlighted with the theme keyword colour', async ({ page }) => {
  await openApp(page);
  await replaceQuery(page, 'SELECT window_start FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(ts), INTERVAL \'1\' MINUTE))');
  const colours = await page.evaluate(() => {
    const kw = getComputedStyle(document.documentElement).getPropertyValue('--tk-kw').trim();
    const spans = [...document.querySelectorAll('#query-editor .cm-line span')];
    const colourOf = (word) => {
      const el = spans.find((s) => s.textContent === word);
      return el ? getComputedStyle(el).color : null;
    };
    const probe = document.createElement('i');
    probe.style.color = kw;
    document.body.appendChild(probe);
    const kwRgb = getComputedStyle(probe).color;
    probe.remove();
    return { kwRgb, select: colourOf('SELECT'), descriptor: colourOf('DESCRIPTOR') };
  });
  expect(colours.select).toBe(colours.kwRgb);
  expect(colours.descriptor).toBe(colours.kwRgb);
});

test('the editor background follows the light / dark toggle', async ({ page }) => {
  await openApp(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('#query-editor .cm-editor')).backgroundColor);
  const before = await bg();
  await page.locator('#theme-toggle').click();
  await expect.poll(bg).not.toBe(before);
  const expected = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--editor-bg').trim();
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  });
  expect(await bg()).toBe(expected);
});

test('choosing a preset replaces both editors and Share sends their text', async ({ page }) => {
  // Headless Linux has no clipboard: record what the app copies instead of hitting its prompt fallback.
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text) => { window.__copied.push(text); } }, configurable: true,
    });
  });
  await openApp(page);
  const options = await page.locator('#example-select option').evaluateAll((os) => os.map((o) => o.value));
  await page.locator('#example-select').selectOption(options[1]);
  const preset = await page.evaluate((i) => EXAMPLES[i], Number(options[1]));
  await expect.poll(() => page.evaluate(() => document.querySelector('#query-editor .cm-content').innerText.trim()))
    .toBe(preset.query.trim());
  let shared = null;
  page.on('request', (r) => { if (/\/api\/fiddles$/.test(r.url())) shared = JSON.parse(r.postData()); });
  await page.locator('#share-btn').click();
  await expect.poll(() => shared).not.toBeNull();
  expect(shared.query).toBe(preset.query);
  expect(shared.schema).toBe(preset.schema);
  await expect.poll(() => page.evaluate(() => window.__copied)).toEqual([expect.stringMatching(/\/f\/abc123$/)]);
});

test('the Code font tweak restyles the editors', async ({ page }) => {
  await openApp(page);
  const font = () => page.evaluate(() => getComputedStyle(document.querySelector('#query-editor .cm-scroller')).fontFamily);
  expect(await font()).toContain('IBM Plex Mono');
  await page.locator('#tweaks-btn').click();
  await page.locator('#twk-font').selectOption({ label: 'Space Mono' });
  await expect.poll(font).toContain('Space Mono');
});

test('Ctrl/Cmd+Enter in the schema editor does not start a second build while one runs', async ({ page }) => {
  await openApp(page);
  let inFlight = 0;
  let maxInFlight = 0;
  await page.route('**/api/sessions/*/execute', async (route) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 300));
    inFlight -= 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ columns: [], rows: [] }) });
  });
  await page.locator('#schema-editor .cm-content').click();
  await page.keyboard.press(`${MOD}+Enter`);
  await page.keyboard.press(`${MOD}+Enter`);
  await page.keyboard.press(`${MOD}+Enter`);
  await expect(page.locator('#build-schema-btn')).toBeEnabled();
  await expect(page.locator('#status-text')).toHaveText('Schema built');
  expect(maxInFlight).toBe(1);
});
