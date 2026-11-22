'use strict';
// The Job Graph tab draws the optimized plan from /explain (stubbed: STREAM_PLAN / BATCH_PLAN in
// stub-api.js): sources on top, the sink at the bottom, shuffles as labelled edges, each
// operator's changelog and state, where updates start, and Flink's plan advice.
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');
const { measureContrast, settleAnimations } = require('./contrast');

const ready = (page) => page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);

async function open(page, { theme } = {}) {
  await stubApi(page);
  if (theme) await page.addInitScript((t) => localStorage.setItem('fsf-tweaks-v2', JSON.stringify({ theme: t, themeExplicit: true })), theme);
  await page.goto('/');
  await ready(page);
}

async function runStreaming(page, sql = 'SELECT region, COUNT(*) FROM orders o JOIN users u ON o.user_id = u.user_id GROUP BY region') {
  await page.evaluate((q) => queryEditor.setValue(q), sql);
  await page.click('#mode-segmented [data-mode="STREAMING"]');
  await page.click('#run-query-btn');
  await expect(page.locator('#run-query-btn .run-label')).toHaveText('Run Query');
}

test('a streaming run draws the real plan: two sources into a join, shuffles on the edges', async ({ page }) => {
  await open(page);
  const explains = [];
  page.on('request', (r) => { if (r.url().endsWith('/explain')) explains.push(JSON.parse(r.postData())); });
  await runStreaming(page);
  await page.click('.rtab[data-tab="graph"]');

  expect(explains.map((e) => e.mode)).toEqual(['STREAMING']);
  await expect(page.locator('.pg-node')).toHaveCount(6); // 9 operators minus 3 exchanges
  await expect(page.locator('.pg-node-name')).toHaveText(['Source: orders', 'Source: users', 'Join', 'Calc', 'GroupAggregate', 'Sink: collect']);
  await expect(page.locator('.pg-edge-label')).toHaveText(['shuffle · hash[user_id]', 'shuffle · hash[user_id]', 'shuffle · hash[region]']);

  // The two sources sit side by side above the join; the sink is the bottom node.
  const box = async (name) => page.locator('.pg-node', { has: page.locator('.pg-node-name', { hasText: new RegExp(`^${name}$`) }) }).boundingBox();
  const [orders, users, join, sink] = [await box('Source: orders'), await box('Source: users'), await box('Join'), await box('Sink: collect')];
  expect(Math.abs(orders.y - users.y)).toBeLessThan(1);
  expect(orders.x + orders.width).toBeLessThanOrEqual(users.x);
  expect(join.y).toBeGreaterThan(orders.y + orders.height);
  expect(sink.y).toBeGreaterThan(join.y + join.height);
});

test('each operator shows its changelog and state, and the aggregate is where updates start', async ({ page }) => {
  await open(page);
  await runStreaming(page);
  await page.click('.rtab[data-tab="graph"]');
  const agg = page.locator('.pg-node[data-kind="GroupAggregate"]');
  await expect(agg.locator('.pg-chip')).toHaveText(['+I', '-U', '+U']);
  await expect(agg.locator('.pg-state')).toHaveText('state grows with keys');
  await expect(agg).toHaveClass(/is-origin/);
  await expect(agg.locator('.pg-advice-ref')).toHaveText('advice 1');
  await expect(page.locator('.pg-node.is-origin')).toHaveCount(1);
  // The sink emits nothing itself; it shows what it receives, and how many rows arrived.
  const sink = page.locator('.pg-node.is-sink');
  await expect(sink.locator('.pg-chip')).toHaveText(['+I', '-U', '+U']);
  await expect(sink.locator('.pg-sink-count')).toHaveText('5 rows received');
  await expect(page.locator('.pg-node[data-kind="Calc"] .pg-chip')).toHaveText(['+I']);
  await expect(page.locator('.pg-insight')).toContainText('GroupAggregate turns inserts into updates');
  await expect(page.locator('.pg-advice li')).toHaveCount(1);
  await expect(page.locator('.pg-advice li')).toContainText('local-global two-phase');
  await expect(page.locator('.jg-status')).toContainText('FINISHED');
  // The full attribute list is one hover away.
  await expect(page.locator('.pg-node[data-kind="Join"]')).toHaveAttribute('title', /joinType=\[InnerJoin\]\nwhere=\[=\(user_id, user_id0\)\]/);
});

test('a batch plan has no changelog chips or state, and says why', async ({ page }) => {
  await open(page);
  await page.click('#mode-segmented [data-mode="BATCH"]');
  await page.click('#run-query-btn');
  await expect(page.locator('.rv-table')).toBeVisible();
  await page.click('.rtab[data-tab="graph"]');
  await expect(page.locator('.pg-node-name')).toHaveText(['Source: orders', 'HashAggregate', 'Sink: collect']);
  await expect(page.locator('.pg-chip')).toHaveCount(0);
  await expect(page.locator('.pg-state')).toHaveCount(0);
  await expect(page.locator('.pg-insight')).toContainText('Batch plan');
  await expect(page.locator('.jg-par')).toHaveText('batch · parallelism 1');
});

test('opening the tab before any run plans what the editor holds', async ({ page }) => {
  await open(page);
  await page.click('#mode-segmented [data-mode="STREAMING"]');
  await page.click('.rtab[data-tab="graph"]');
  await expect(page.locator('.pg-node')).toHaveCount(6);
  await expect(page.locator('.jg-status')).toContainText('PLANNED');
  await expect(page.locator('.pg-sink-count')).toHaveCount(0);
  // Switching mode re-plans in the other planner.
  await page.click('#mode-segmented [data-mode="BATCH"]');
  await expect(page.locator('.pg-node-name')).toHaveText(['Source: orders', 'HashAggregate', 'Sink: collect']);
});

test('a statement with no plan says so, without an error style', async ({ page }) => {
  await open(page);
  await page.evaluate(() => queryEditor.setValue('-- stub: ddl\nCREATE TABLE t (a INT)'));
  await page.click('.rtab[data-tab="graph"]');
  await expect(page.locator('.rv-empty-label')).toHaveText('No job graph for this statement');
  await expect(page.locator('.rv-empty')).not.toHaveClass(/is-error/);
});

test('the raw plan disclosure stays open across renders', async ({ page }) => {
  await open(page);
  await runStreaming(page);
  await page.click('.rtab[data-tab="graph"]');
  await page.click('.pg-raw summary');
  await expect(page.locator('.pg-raw pre')).toContainText('GroupAggregate(advice=[1]');
  await page.click('.rtab[data-tab="table"]');
  await page.click('.rtab[data-tab="graph"]');
  await expect(page.locator('.pg-raw')).toHaveAttribute('open', '');
});

test('plan text is escaped, never parsed as HTML', async ({ page }) => {
  await stubApi(page);
  await page.route('**/explain', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    mode: 'STREAMING', roots: [0], advice: [{ id: 1, level: 'ADVICE', text: '<img src=x onerror="window.__pwned=1">' }],
    plan: '<b>raw</b>',
    nodes: [{ id: 0, kind: 'Sink', label: 'Sink: <img src=x onerror="window.__pwned=1">', attrs: { fields: '<svg onload="window.__pwned=1">' }, changelogMode: [], state: null, advice: [1], inputs: [] }],
  }) }));
  await page.goto('/');
  await ready(page);
  await page.click('.rtab[data-tab="graph"]');
  await expect(page.locator('.pg-node-name')).toHaveText('Sink: <img src=x onerror="window.__pwned=1">');
  await expect(page.locator('.rv-plan img, .rv-plan svg[onload], .rv-plan b')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme}: job graph text reaches 4.5:1`, async ({ page }) => {
    await open(page, { theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await runStreaming(page);
    await page.click('.rtab[data-tab="graph"]');
    await expect(page.locator('.pg-node')).toHaveCount(6);
    await settleAnimations(page);
    const results = await page.evaluate((fn) => new Function(`return (${fn})`)()([
      ...[...document.querySelectorAll('.pg-chip')].map((el) => ({ what: `chip ${el.textContent}`, el })),
      ...['.pg-insight', '.pg-node-name', '.pg-meta', '.pg-state', '.pg-origin', '.pg-advice-ref', '.pg-edge-label',
        '.pg-advice li', '.pg-advice-level', '.pg-raw summary', '.jg-status', '.jg-par']
        .map((sel) => ({ what: sel, el: document.querySelector(sel) })),
    ]), measureContrast.toString());
    const low = results.filter((m) => m.ratio < 4.5);
    expect(low, `${theme}: text below 4.5:1`).toEqual([]);
  });
}

test('on a phone a wide plan scrolls inside the graph, never the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page);
  await runStreaming(page);
  await page.locator('.m-views [data-mview="results"]').click();
  await page.click('.rtab[data-tab="graph"]');
  await expect(page.locator('.pg-node')).toHaveCount(6);
  const g = await page.evaluate(() => {
    const s = document.querySelector('.pg-scroll');
    return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: s.scrollWidth > s.clientWidth };
  });
  expect(g).toEqual({ page: 0, wide: true });
});
