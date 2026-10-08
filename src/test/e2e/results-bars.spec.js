'use strict';
// Desktop windows (mouse) in Chromium and WebKit: the results box pins its bar, and what sits
// below it stays visible and clickable while the rows scroll (#68).
const { test, expect } = require('@playwright/test');
const { openApp } = require('./layout');
const { settleAnimations } = require('./contrast');
const { runManyRows, runRetractions, runLongTail, scrollResults, headerHits, openEachFilter, changelogReach } = require('./results-bars');

test.beforeEach(async ({ page }) => { await openApp(page); });

// On main the column headers slid under the filter bar once the rows scrolled: up to 8 of them
// hit-tested to the bar, which took their clicks.
for (const [width, height] of [[1024, 700], [1280, 800], [1920, 1080]]) {
  test(`at ${width}x${height}, the column headers stay below the filter bar and open their filters while the rows scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await runManyRows(page, false);
    for (const top of [0, 40, 'end']) {
      await scrollResults(page, top);
      const h = await headerHits(page);
      expect(h.scrollTop, 'the rows scroll').toBeGreaterThan(top === 0 ? -1 : 0);
      expect({ bars: h.bars, misses: h.misses, under: h.under }, `rows scrolled ${top}`).toEqual({ bars: [], misses: [], under: [] });
      expect(h.points.length, 'headers on screen').toBeGreaterThanOrEqual(5);
      expect(await openEachFilter(page, false, top), `rows scrolled ${top}`).toMatchObject({ failed: [] });
    }
  });
}

test('a filter bar grown by its chips keeps the headers below it while the rows scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await runManyRows(page, false);
  // A filter on every column, each matching every row, adds eight chips; the bar wraps to fit them.
  const before = await page.locator('.rv-filterbar').evaluate((el) => el.getBoundingClientRect().height);
  for (const [col, value] of ['0', 'region', '0', '0', '0', '2026', '2026', 'A'].entries()) {
    await page.locator('.th-btn').nth(col).click();
    await page.locator('.filt-pop .filt-v').fill(value);
    await page.locator('.filt-pop [data-apply]').click();
  }
  await expect(page.locator('.rv-chip')).toHaveCount(8);
  await expect(page.locator('.rv-table tbody tr')).toHaveCount(40);
  await scrollResults(page, 60);
  const g = await page.evaluate(() => ({ bar: document.querySelector('.rv-filterbar').getBoundingClientRect(),
    head: document.querySelector('.th-btn').getBoundingClientRect().top }));
  expect(g.bar.height, 'the bar grew').toBeGreaterThan(before + 20);
  expect(g.head, 'header top at the bar bottom').toBeCloseTo(g.bar.bottom, 0);
  const h = await headerHits(page);
  expect({ bars: h.bars, misses: h.misses, under: h.under }).toEqual({ bars: [], misses: [], under: [] });
});

test('the changelog bar stays pinned and a whole row shows below it while the rows scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await runRetractions(page, false);
  for (const top of [0, 'end']) {
    await scrollResults(page, top);
    const g = await page.evaluate(() => {
      const box = document.getElementById('results-container');
      const b = box.getBoundingClientRect();
      const bar = document.querySelector('.rv-log-bar').getBoundingClientRect();
      const bottom = b.top + box.clientTop + box.clientHeight;
      return { pinned: Math.abs(bar.top - (b.top + box.clientTop)) < 1,
        whole: [...document.querySelectorAll('.rv-log-row')].filter((r) => { const q = r.getBoundingClientRect(); return q.top >= bar.bottom - 0.5 && q.bottom <= bottom + 0.5; }).length };
    });
    expect(g.pinned, `bar pinned, rows scrolled ${top}`).toBe(true);
    expect(g.whole, `whole rows below the bar, rows scrolled ${top}`).toBeGreaterThanOrEqual(1);
  }
});

// The changelog keeps up to 400 events, and a row's height depends on how far its values wrap.
// At 1024x700 the 197px box holds the 51px bar and the tallest of the first 50 rows (93px), but
// not event 55 (169px): measuring only the first 50 rows left the bar pinned over it.
test('with more than 50 events, a later and taller changelog row can still be scrolled into view whole', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await runLongTail(page, false);
  const r = await changelogReach(page);
  expect(r.rows).toBe(60);
  expect(r.unreachable, 'rows never shown whole').toEqual([]);
});

// The bar's state on the results box (.is-scrolled, .bar-scrolls, --filterbar-h) belongs to the
// table and changelog views: the throughput and job graph views, which have no bar, drop it, and
// the table recomputes it on return.
test('views without a bar drop the bar state from the results box, and the table restores it', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await runManyRows(page, false);
  await scrollResults(page, 60);
  const state = () => page.locator('#results-container').evaluate((el) => ({
    scrolled: el.classList.contains('is-scrolled'), barScrolls: el.classList.contains('bar-scrolls'), barH: el.style.getPropertyValue('--filterbar-h') }));
  expect(await state()).toEqual({ scrolled: true, barScrolls: false, barH: '44px' });
  for (const tab of ['throughput', 'graph']) {
    await page.locator(`.rtab[data-tab="${tab}"]`).click();
    await scrollResults(page, 40);
    expect(await state(), tab).toEqual({ scrolled: false, barScrolls: false, barH: '' });
  }
  await page.locator('.rtab[data-tab="table"]').click();
  await scrollResults(page, 60);
  expect(await state(), 'back on the table').toEqual({ scrolled: true, barScrolls: false, barH: '44px' });
});

// Maximizing the results panel scales it up from 0.985 (maxIn) while the box and bar resize, and
// the ResizeObserver fits the bar in those frames. A height read through the transform left
// --filterbar-h about 0.66px short for the rest of a batch table's maximized session, with the
// top of every header under the bar.
test('in a maximized results panel the headers stay below the filter bar while the rows scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await runManyRows(page, false);
  await page.locator('#results-panel .panel-maximize-btn').click();
  await expect(page.locator('#results-panel')).toHaveClass(/panel-maximized/);
  await settleAnimations(page);
  await scrollResults(page, 40);
  const h = await headerHits(page);
  expect({ bars: h.bars, misses: h.misses, under: h.under }).toEqual({ bars: [], misses: [], under: [] });
  const g = await page.locator('#results-container').evaluate((el) => ({
    var: parseFloat(el.style.getPropertyValue('--filterbar-h')), bar: el.querySelector('.rv-filterbar').getBoundingClientRect().height }));
  expect(Math.abs(g.var - g.bar), `--filterbar-h ${g.var} against the bar's ${g.bar}px`).toBeLessThanOrEqual(0.5);
});
