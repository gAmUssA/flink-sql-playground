'use strict';
// The results box's bar (the table's filter bar, the changelog's op toggles and search) against
// what must stay visible below it while the rows scroll (#68, #69). Shared by the desktop,
// mobile and landscape specs.
const { expect } = require('@playwright/test');
const { fontsReady } = require('./layout');

/** Runs a batch query returning 40 rows (stub-api.js), enough to scroll the box in a tall window. */
async function runManyRows(page, touch) {
  const act = (sel) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
  await page.evaluate(() => queryEditor.setValue('-- stub: many rows\nSELECT * FROM orders'));
  await act('#mode-segmented [data-mode="BATCH"]');
  await act('#run-query-btn');
  if (touch) await act('.m-views [data-mview="results"]');
  await expect(page.locator('.rv-table tbody tr')).toHaveCount(40);
}

/** Runs the streaming query whose changelog holds all four ops, and shows the changelog. */
async function runRetractions(page, touch) {
  const act = (sel) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
  await page.evaluate(() => queryEditor.setValue('-- stub: retractions\nSELECT * FROM orders'));
  await act('#mode-segmented [data-mode="STREAMING"]');
  await act('#run-query-btn');
  await expect(page.locator('#run-query-btn')).toBeEnabled();
  if (touch) await act('.m-views [data-mview="results"]');
  await act('.rtab[data-tab="changelog"]');
  await expect(page.locator('.rv-log-row')).toHaveCount(8);
  // Rows slide in (logIn); measure where they settle.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

/** Scrolls the results box, then waits a frame so the page has handled the scroll, as before a tap. */
async function scrollResults(page, top, left = 0) {
  await page.locator('#results-container').evaluate((el, [t, l]) => {
    el.scrollTop = t === 'end' ? el.scrollHeight : t;
    el.scrollLeft = l;
    return new Promise((r) => requestAnimationFrame(() => r()));
  }, [top, left]);
  await fontsReady(page);
}

/**
 * The column headers on screen against the filter bar: the visible part of each header (inside
 * the box and the window), whether any of it lies under the pinned bar, and where a tap at its
 * centre lands. `bars` lists headers that hit-test to the filter bar, `misses` those that hit
 * anything other than their own button, `under` those whose top edge is above the bar's bottom.
 */
async function headerHits(page) {
  return page.evaluate(() => {
    const box = document.getElementById('results-container');
    const b = box.getBoundingClientRect();
    const view = { top: b.top + box.clientTop, bottom: b.top + box.clientTop + box.clientHeight,
      left: Math.max(0, b.left + box.clientLeft), right: Math.min(window.innerWidth, b.left + box.clientLeft + box.clientWidth) };
    const bar = document.querySelector('.rv-filterbar').getBoundingClientRect();
    const barBottom = Math.max(view.top, Math.min(bar.bottom, view.bottom));
    const bars = [], misses = [], under = [], points = [];
    [...document.querySelectorAll('.th-btn')].forEach((btn, i) => {
      const r = btn.getBoundingClientRect();
      const x0 = Math.max(r.left, view.left), x1 = Math.min(r.right, view.right);
      const y0 = Math.max(r.top, view.top), y1 = Math.min(r.bottom, view.bottom);
      if (x1 - x0 < 4 || y1 - y0 < 4) return;
      if (r.top < barBottom - 0.5) under.push(i);
      const p = { i, x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      const hit = document.elementFromPoint(p.x, p.y);
      if (hit && hit.closest('.rv-filterbar')) bars.push(i);
      else if (!hit || hit.closest('.th-btn') !== btn) misses.push(i);
      points.push(p);
    });
    return { bars, misses, under, points, scrollTop: box.scrollTop };
  });
}

/**
 * Taps (or clicks) the centre of each header's visible part, at the given scroll position, and
 * checks that the filter for that column opens. Returns the columns whose filter did not open.
 */
async function openEachFilter(page, touch, top, left = 0) {
  await scrollResults(page, top, left);
  const { points } = await headerHits(page);
  const names = await page.locator('.th-btn .rv-col').allTextContents();
  const failed = [];
  for (const p of points) {
    await scrollResults(page, top, left);
    const again = (await headerHits(page)).points.find((q) => q.i === p.i);
    if (touch) await page.touchscreen.tap(again.x, again.y); else await page.mouse.click(again.x, again.y);
    const pop = page.locator('.filt-pop .filt-pop-col');
    if (await pop.count() === 0 || (await pop.textContent()) !== names[p.i]) failed.push(names[p.i]);
    await page.keyboard.press('Escape');
    await expect(page.locator('.filt-pop')).toHaveCount(0);
  }
  return { opened: points.length - failed.length, failed };
}

module.exports = { runManyRows, runRetractions, scrollResults, headerHits, openEachFilter };
