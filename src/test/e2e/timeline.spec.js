'use strict';
// The Timeline tab records a sample of the query's watermarked source (stubbed: TIMELINE_META and
// TIMELINE_TICKS in stub-api.js, 120 clicks, 51 of them dropped by fired 5 s windows) and draws
// each record against the watermark.
const { test, expect } = require('@playwright/test');
const { stubApi, TIMELINE_TICKS } = require('./stub-api');
const { measureContrast, settleAnimations } = require('./contrast');

const ready = (page) => page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);

async function open(page, theme) {
  await stubApi(page);
  if (theme) await page.addInitScript((t) => localStorage.setItem('fsf-tweaks-v2', JSON.stringify({ theme: t, themeExplicit: true })), theme);
  await page.goto('/');
  await ready(page);
  await page.click('#mode-segmented [data-mode="STREAMING"]');
}

function probeRequests(page) {
  const seen = [];
  page.on('request', (r) => { if (r.url().endsWith('/timeline/stream')) seen.push(JSON.parse(r.postData())); });
  return seen;
}

test('running with the tab open records the timeline alongside the query', async ({ page }) => {
  await open(page);
  const probes = probeRequests(page);
  await page.click('.rtab[data-tab="timeline"]');
  await expect(page.locator('.rv-empty-label')).toHaveText('No timeline yet');
  await page.click('#run-query-btn');
  await expect(page.locator('.wt-dot')).toHaveCount(TIMELINE_TICKS.length);
  expect(probes.map((p) => p.mode)).toEqual(['STREAMING']);
  await expect(page.locator('.wt-dot.is-dropped')).toHaveCount(51);
  await expect(page.locator('.wt-dot.is-late')).toHaveCount(18);
  await expect(page.locator('.wt-stat.is-dropped')).toHaveText('51 dropped (43%)');
  await expect(page.locator('.wt-lead')).toContainText('A sample of the clicks stream');
  await expect(page.locator('.wt-lead')).toContainText('tumbling 5 s windows');
  await expect(page.locator('.wt-note')).toContainText('not the rows of your run');
  await expect(page.locator('.wt-wm')).toHaveCount(1);
  await expect(page.locator('.wt-band')).toHaveCount(7);
  await expect(page.locator('.wt-fire')).toHaveCount(6);
  await expect(page.locator('#timeline-record-btn')).toHaveText(/Record again/);
});

test('a run on another tab starts no probe', async ({ page }) => {
  await open(page);
  const probes = probeRequests(page);
  await page.click('#run-query-btn');
  await expect(page.locator('#run-query-btn .run-label')).toHaveText('Run Query');
  await page.click('.rtab[data-tab="timeline"]');
  await expect(page.locator('.rv-empty-label')).toHaveText('No timeline yet');
  expect(probes).toEqual([]);
});

test('opening the tab while a run is live starts the probe for that run', async ({ page }) => {
  await open(page);
  const probes = probeRequests(page);
  await page.evaluate(() => queryEditor.setValue('-- stub: slow\nSELECT * FROM clicks'));
  await page.click('#run-query-btn');
  await expect(page.locator('#run-query-btn .run-label')).toHaveText('Stop');
  await page.click('.rtab[data-tab="timeline"]');
  await expect(page.locator('.wt-dot')).toHaveCount(TIMELINE_TICKS.length);
  expect(probes.map((p) => p.sql)).toEqual(['-- stub: slow\nSELECT * FROM clicks']);
  await expect(page.locator('#run-query-btn .run-label')).toHaveText('Run Query');
});

test('leaving the tab or switching to batch stops a live probe', async ({ page }) => {
  await open(page);
  let aborted = 0;
  await page.route('**/timeline/stream', () => {}); // never answers: the probe stays live until aborted
  page.on('requestfailed', (r) => { if (r.url().endsWith('/timeline/stream')) aborted++; });
  await page.click('.rtab[data-tab="timeline"]');
  await page.click('#timeline-record-btn');
  await expect(page.locator('.rv-empty-label')).toHaveText('Recording…');
  await page.click('.rtab[data-tab="table"]');
  await expect.poll(() => aborted).toBe(1);
  await page.click('.rtab[data-tab="timeline"]');
  await page.click('#timeline-record-btn');
  await page.click('#mode-segmented [data-mode="BATCH"]');
  await expect.poll(() => aborted).toBe(2);
});

test('Record timeline records a sample without running the query', async ({ page }) => {
  await open(page);
  const runs = [];
  page.on('request', (r) => { if (/\/execute/.test(r.url())) runs.push(r.url()); });
  await page.click('.rtab[data-tab="timeline"]');
  await page.click('#timeline-record-btn');
  await expect(page.locator('.wt-dot')).toHaveCount(TIMELINE_TICKS.length);
  expect(runs.filter((u) => !/SELECT 1/.test(u))).toEqual([]);
});

test('a query without event time says so', async ({ page }) => {
  await open(page);
  await page.evaluate(() => queryEditor.setValue('-- stub: no event time\nSELECT a FROM plain'));
  await page.click('.rtab[data-tab="timeline"]');
  await page.click('#timeline-record-btn');
  await expect(page.locator('.rv-empty-label')).toHaveText('No event-time timeline for this query');
  await expect(page.locator('.rv-empty-hint')).toContainText('declares a WATERMARK');
  await expect(page.locator('.rv-empty')).not.toHaveClass(/is-error/);
});

test('batch mode explains that watermarks are a streaming thing', async ({ page }) => {
  await open(page);
  await page.click('#mode-segmented [data-mode="BATCH"]');
  await page.click('.rtab[data-tab="timeline"]');
  await expect(page.locator('.rv-empty-label')).toHaveText('Watermarks live in streaming mode');
});

test('the chart redraws at the new size when the results panel is maximized', async ({ page }) => {
  await open(page);
  await page.click('.rtab[data-tab="timeline"]');
  await page.click('#timeline-record-btn');
  await expect(page.locator('.wt-dot')).toHaveCount(TIMELINE_TICKS.length);
  const before = Number(await page.locator('.wt-svg').getAttribute('height'));
  await page.locator('#results-panel .panel-maximize-btn').click();
  await expect.poll(async () => Number(await page.locator('.wt-svg').getAttribute('height'))).toBeGreaterThan(before);
  const fit = await page.locator('.wt-svg').evaluate((svg) => svg.getBoundingClientRect().right <= document.getElementById('results-container').getBoundingClientRect().right + 0.5);
  expect(fit).toBe(true);
});

test('the canonical preset is in the example list', async ({ page }) => {
  await open(page);
  const titles = await page.locator('#example-select option').allTextContents();
  expect(titles).toContain('Watermark Timeline: who misses the window');
});

for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme}: timeline text reaches 4.5:1`, async ({ page }) => {
    await open(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.click('.rtab[data-tab="timeline"]');
    await page.click('#timeline-record-btn');
    await expect(page.locator('.wt-dot')).toHaveCount(TIMELINE_TICKS.length);
    await settleAnimations(page);
    const results = await page.evaluate((fn) => new Function(`return (${fn})`)()(
      ['.wt-lead', '.wt-lead code', '.wt-stat', '.wt-stat b', '.wt-stat.is-dropped b', '.wt-stat.is-late b', '.wt-legend span', '.wt-note', '#timeline-record-btn']
        .map((sel) => ({ what: sel, el: document.querySelector(sel) }))), measureContrast.toString());
    expect(results.filter((m) => m.ratio < 4.5), `${theme}: text below 4.5:1`).toEqual([]);
  });
}
