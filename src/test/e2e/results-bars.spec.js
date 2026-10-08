'use strict';
// Desktop windows (mouse) in Chromium and WebKit: the results box pins its bar, and what sits
// below it stays visible and clickable while the rows scroll (#68).
const { test, expect } = require('@playwright/test');
const { openApp } = require('./layout');
const { runManyRows, runRetractions, scrollResults, headerHits, openEachFilter } = require('./results-bars');

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
