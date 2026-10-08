'use strict';
// Phones held sideways: runs on the iPhone 13 (844x390) and Pixel 7 (915x412) landscape
// projects, in Chromium and WebKit (see playwright.config.js). mobile.spec.js runs there too.
const { test, expect } = require('@playwright/test');
const { openApp, layoutState, layoutOf, PHONE, DESKTOP } = require('./layout');

const MIN_CONTENT = 160;

async function runBatchQuery(page) {
  await page.locator('#mode-segmented [data-mode="BATCH"]').tap();
  await page.locator('#run-query-btn').tap();
  await expect(page.locator('.rv-table')).toBeVisible();
}

test.beforeEach(async ({ page }) => { await openApp(page); });

test('gets the phone layout, not the desktop sidebar', async ({ page }) => {
  expect(layoutOf(await layoutState(page))).toEqual(PHONE);
});

test('the active panel keeps at least 160px for its content in every view', async ({ page }) => {
  const body = { schema: '#schema-panel .pane-body', query: '#query-panel .pane-body', results: '#results-container' };
  await runBatchQuery(page);
  for (const [view, sel] of Object.entries(body)) {
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    const h = await page.locator(sel).evaluate((el) => el.getBoundingClientRect().height);
    expect(h, `${view} content height`).toBeGreaterThanOrEqual(MIN_CONTENT);
  }
});

test('the chrome is compact: tabs beside the brand, no subtitle, one toolbar row, one status line', async ({ page }) => {
  await runBatchQuery(page);
  await expect(page.locator('.brand-text p')).toBeHidden();
  await expect(page.locator('.m-views')).toBeVisible();
  const g = await page.evaluate(() => {
    const centre = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const tabsRow = Math.abs(centre(document.querySelector('.m-views')) - centre(document.querySelector('.topbar')));
    const visible = (el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
    const toolbar = [...document.querySelectorAll('.toolbar > *')].filter(visible).map(centre);
    const status = [...document.querySelectorAll('.statusbar > *')].filter(visible).map(centre);
    return { tabsRow, toolbarSpread: Math.max(...toolbar) - Math.min(...toolbar), statusSpread: Math.max(...status) - Math.min(...status),
      statusHeight: document.querySelector('.statusbar').getBoundingClientRect().height,
      statusFont: parseFloat(getComputedStyle(document.querySelector('.statusbar')).fontSize) };
  });
  expect(g.tabsRow, 'panel tabs share the topbar row').toBeLessThan(2);
  expect(g.toolbarSpread, 'toolbar items share one row').toBeLessThan(2);
  expect(g.statusSpread, 'status items share one line').toBeLessThan(2);
  expect(g.statusHeight, 'status bar is one line tall').toBeLessThan(g.statusFont * 3);
});

test('left and right safe-area insets keep content clear of the notch', async ({ page, browserName }) => {
  // Only Chromium can emulate safe-area insets (CDP Emulation.setSafeAreaInsetsOverride).
  test.skip(browserName !== 'chromium', 'WebKit has no safe-area inset emulation');
  const INSET = 47;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: INSET, right: INSET, top: 0, bottom: 21 } });
  await runBatchQuery(page);
  const vw = page.viewportSize().width;
  const clear = async (sel) => {
    const r = await page.locator(sel).evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right };
    });
    expect(r.left, `${sel} left edge`).toBeGreaterThanOrEqual(INSET);
    expect(r.right, `${sel} right edge`).toBeLessThanOrEqual(vw - INSET);
  };
  for (const sel of ['.brand', '.topbar-actions', '#m-tab-schema', '#m-tab-results', '#build-schema-btn', '#share-btn', '#sb-state']) await clear(sel);
  for (const view of ['query', 'schema', 'results']) {
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    const content = { query: '#query-panel .pane-body', schema: '#schema-panel .pane-body', results: '#results-container' }[view];
    await clear(content);
  }
  await page.locator('#tables-drawer-btn').tap();
  await expect.poll(() => page.locator('#schema-browser').evaluate((el) => el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(-1);
  await clear('#schema-browser-toggle');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('rotating switches the layout live, without a reload', async ({ page }) => {
  const landscape = page.viewportSize();
  const portrait = { width: landscape.height, height: landscape.width };
  await page.evaluate(() => { window.__notReloaded = true; });

  await page.setViewportSize(portrait);
  await expect.poll(async () => layoutOf(await layoutState(page))).toEqual(PHONE);
  // Open the drawer in portrait; it stays open, and still traps focus, after rotating.
  await page.locator('#tables-drawer-btn').tap();
  await page.setViewportSize(landscape);
  await expect.poll(async () => layoutOf(await layoutState(page))).toEqual(PHONE);
  await expect(page.locator('#drawer-backdrop')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('schema-browser').contains(document.activeElement))).toBe(true);
  expect(await page.locator('.editors').evaluate((el) => el.inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#tables-drawer-btn')).toBeFocused();
  expect(await page.locator('#schema-browser').evaluate((el) => el.inert)).toBe(true);

  await page.setViewportSize(portrait);
  await expect.poll(async () => layoutOf(await layoutState(page))).toEqual(PHONE);
  await page.setViewportSize(landscape);
  await expect.poll(async () => layoutOf(await layoutState(page))).toEqual(PHONE);
  expect(await page.evaluate(() => window.__notReloaded)).toBe(true);
});

test('growing past the criterion closes the drawer and restores the desktop semantics', async ({ page }) => {
  const landscape = page.viewportSize();
  await page.locator('#tables-drawer-btn').tap();
  await expect(page.locator('#drawer-backdrop')).toBeVisible();

  await page.setViewportSize({ width: 1180, height: 820 }); // tablet-sized: desktop layout
  await expect.poll(async () => layoutOf(await layoutState(page))).toEqual(DESKTOP);
  await expect(page.locator('#drawer-backdrop')).toBeHidden();
  const s = await layoutState(page);
  expect(s.sidebarInert).toBe(false);
  expect(await page.locator('.editors').evaluate((el) => el.inert)).toBe(false);
  await expect(page.locator('#schema-browser')).not.toHaveAttribute('aria-hidden', 'true');

  await page.setViewportSize(landscape);
  await expect.poll(async () => layoutOf(await layoutState(page))).toEqual(PHONE);
  expect((await layoutState(page)).sidebarInert).toBe(true);
  await expect(page.locator('#drawer-backdrop')).toBeHidden();
});

test('the column filter fits a 667x375 phone and scrolls when the keyboard leaves less room', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await runBatchQuery(page);
  const header = page.locator('.th-btn').first();
  await header.tap();
  const inside = async () => page.locator('.filt-pop').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const reach = (s) => { const b = el.querySelector(s); b.scrollIntoView({ block: 'nearest' }); const q = b.getBoundingClientRect(); return q.top >= 0 && q.bottom <= window.innerHeight; };
    return { top: r.top >= 0, bottom: r.bottom <= window.innerHeight, input: reach('.filt-v'), clear: reach('[data-clear]'), apply: reach('[data-apply]') };
  });
  const ALL = { top: true, bottom: true, input: true, clear: true, apply: true };
  expect(await inside()).toEqual(ALL);
  // The keyboard opens over the focused input: the window shrinks below the popover's height.
  await page.setViewportSize({ width: 667, height: 190 });
  await expect.poll(inside).toEqual(ALL);
  const scroll = await page.locator('.filt-pop').evaluate((el) => ({ capped: el.scrollHeight > el.clientHeight, overflowY: getComputedStyle(el).overflowY }));
  expect(scroll).toEqual({ capped: true, overflowY: 'auto' });
});

// The on-screen keyboard (interactive-widget=resizes-content) shrinks the window; resizing the
// viewport while an editor has focus stands in for it.
const KEYBOARD_OPEN = [{ width: 844, height: 200 }, { width: 915, height: 220 }, { width: 780, height: 170 }, { width: 667, height: 190 }];

async function chrome(page, view) {
  return page.evaluate((v) => ({
    toolbar: getComputedStyle(document.querySelector('.toolbar')).display !== 'none',
    statusbar: getComputedStyle(document.querySelector('.statusbar')).display !== 'none',
    editorShare: document.querySelector(`#${v}-panel .pane-body`).getBoundingClientRect().height / window.innerHeight,
  }), view);
}

for (const view of ['query', 'schema']) {
  test(`with the keyboard open, the focused ${view} editor gets the toolbar's and status bar's room`, async ({ page }) => {
    const landscape = page.viewportSize();
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    await page.evaluate((v) => (v === 'query' ? queryEditor : schemaEditor).focus(), view);
    // Keyboard closed: nothing changes while the editor has focus.
    expect(await chrome(page, view)).toMatchObject({ toolbar: true, statusbar: true });
    for (const size of KEYBOARD_OPEN) {
      await page.setViewportSize(size);
      const c = await chrome(page, view);
      expect({ toolbar: c.toolbar, statusbar: c.statusbar }, `${size.width}x${size.height}`).toEqual({ toolbar: false, statusbar: false });
      expect(c.editorShare, `${size.width}x${size.height} editor share of the window`).toBeGreaterThanOrEqual(0.5);
    }
    // Focus leaves the editor: both bars come back.
    await page.evaluate(() => document.activeElement.blur());
    expect(await chrome(page, view)).toMatchObject({ toolbar: true, statusbar: true });
    // Focus returns, then the keyboard closes and the window grows: both bars come back.
    await page.evaluate((v) => (v === 'query' ? queryEditor : schemaEditor).focus(), view);
    expect(await chrome(page, view)).toMatchObject({ toolbar: false, statusbar: false });
    await page.setViewportSize(landscape);
    expect(await chrome(page, view)).toMatchObject({ toolbar: true, statusbar: true });
  });
}

// Guards the 260px height clause: an upright phone with the keyboard open is taller than that.
test('an upright phone with the keyboard open (taller than 260px) keeps its toolbar and status bar', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 450 });
  await page.evaluate(() => queryEditor.focus());
  expect(await chrome(page, 'query')).toMatchObject({ toolbar: true, statusbar: true });
});

// Guards the 560px width floor: a focused editor in a window 260px tall or less hides both bars
// only when the window is at least 560px wide, as the compaction query requires.
for (const [width, height, bars] of [[520, 240, true], [844, 200, false]]) {
  test(`a focused editor in a ${width}x${height} touch window ${bars ? 'keeps' : 'hides'} its toolbar and status bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => queryEditor.focus());
    expect(await chrome(page, 'query')).toMatchObject({ toolbar: bars, statusbar: bars });
  });
}

// Guards the orientation clause: a portrait window no taller than 260px keeps both bars.
test('a portrait touch window 260px tall or less keeps its toolbar and status bar', async ({ page }) => {
  await page.setViewportSize({ width: 250, height: 255 });
  await page.evaluate(() => queryEditor.focus());
  expect(await chrome(page, 'query')).toMatchObject({ toolbar: true, statusbar: true });
});

for (const view of ['schema', 'query']) {
  test(`a ${view} pane maximized before the phone layout keeps clear of the notch`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit has no safe-area inset emulation');
    const INSET = 47;
    const landscape = page.viewportSize();
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    // Maximize on a tablet-sized screen (desktop layout), then shrink back to the phone held sideways.
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.locator(`#${view}-panel .panel-maximize-btn`).tap();
    await expect(page.locator(`#${view}-panel`)).toHaveClass(/panel-maximized/);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: INSET, right: INSET, top: 0, bottom: 21 } });
    await page.setViewportSize(landscape);
    await expect.poll(async () => (await layoutState(page)).jsPhone).toBe(true);
    // Measure the settled box, not one scaled by the maximize animation.
    await page.locator(`#${view}-panel`).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const r = await page.locator(`#${view}-panel`).evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width }; });
    expect(r.width, 'the maximized pane is shown').toBeGreaterThan(0);
    expect(r.left, 'left edge').toBeGreaterThanOrEqual(INSET);
    expect(r.right, 'right edge').toBeLessThanOrEqual(landscape.width - INSET);
  });
}

// Rotating the phone while the column filter is open: the popover is re-clamped on both axes.
async function filterInside(page) {
  return page.locator('.filt-pop').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const reach = (s) => { const b = el.querySelector(s); b.scrollIntoView({ block: 'nearest' }); const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= window.innerWidth && q.top >= 0 && q.bottom <= window.innerHeight; };
    return { left: r.left >= 0, right: r.right <= window.innerWidth, top: r.top >= 0, bottom: r.bottom <= window.innerHeight,
      input: reach('.filt-v'), clear: reach('[data-clear]'), apply: reach('[data-apply]') };
  });
}
const FILTER_INSIDE = { left: true, right: true, top: true, bottom: true, input: true, clear: true, apply: true };

/** Opens the filter on the rightmost column header that is fully on screen. */
async function openRightmostFilter(page) {
  const i = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.th-btn')];
    return btns.reduce((best, b, n) => (b.getBoundingClientRect().right <= window.innerWidth ? n : best), 0);
  });
  await page.locator('.th-btn').nth(i).tap();
  await expect(page.locator('.filt-pop')).toBeVisible();
}

test('the column filter stays inside the window when the phone turns upright while it is open', async ({ page }) => {
  const landscape = page.viewportSize();
  await runBatchQuery(page);
  await openRightmostFilter(page);
  expect(await filterInside(page)).toEqual(FILTER_INSIDE);
  await page.setViewportSize({ width: landscape.height, height: landscape.width });
  await expect.poll(() => filterInside(page)).toEqual(FILTER_INSIDE);
});

test('the column filter stays inside the window when the phone turns sideways while it is open', async ({ page }) => {
  const landscape = page.viewportSize();
  await page.setViewportSize({ width: landscape.height, height: landscape.width });
  await runBatchQuery(page);
  await openRightmostFilter(page);
  expect(await filterInside(page)).toEqual(FILTER_INSIDE);
  await page.setViewportSize(landscape);
  await expect.poll(() => filterInside(page)).toEqual(FILTER_INSIDE);
});

/**
 * The column header row against the results box and its filter bar: whether the whole row is
 * inside the box and clear of the bar, and which on-screen headers a tap at their centre misses,
 * landing on the filter bar (`bar`) or on anything else (`miss`).
 */
async function headerRow(page) {
  return page.evaluate(() => {
    const box = document.getElementById('results-container');
    const b = box.getBoundingClientRect();
    const view = { top: b.top + box.clientTop, bottom: b.top + box.clientTop + box.clientHeight };
    const head = document.querySelector('.rv-table thead').getBoundingClientRect();
    const bar = document.querySelector('.rv-filterbar').getBoundingClientRect();
    const barShown = { top: Math.max(bar.top, view.top), bottom: Math.min(bar.bottom, view.bottom) };
    const bars = [], misses = [];
    [...document.querySelectorAll('.th-btn')].forEach((btn, i) => {
      const r = btn.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth) return;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit.closest('.rv-filterbar')) bars.push(i);
      else if (!hit || hit.closest('.th-btn') !== btn) misses.push(i);
    });
    return { inBox: head.top >= view.top - 0.5 && head.bottom <= view.bottom + 0.5,
      clearOfBar: barShown.bottom <= barShown.top || head.top >= barShown.bottom - 0.5 || head.bottom <= barShown.top + 0.5, bars, misses };
  });
}

/** Taps the on-screen part of column header `i`, as a finger would: no scrolling first. */
async function tapHeader(page, i) {
  const p = await page.evaluate((n) => {
    const box = document.getElementById('results-container').getBoundingClientRect();
    const r = document.querySelectorAll('.th-btn')[n].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: (r.top + Math.min(r.bottom, box.bottom)) / 2 };
  }, i);
  await page.touchscreen.tap(p.x, p.y);
}

// A 568x320 window is a 4-inch phone held sideways: its results box is too short for the filter
// bar and the header row together. On main, opening a filter or scrolling the rows slid the
// headers under the bar, which then took their taps.
for (const [width, height] of [[568, 320], [667, 375], [844, 390], [915, 412]]) {
  test(`at ${width}x${height}, opening a column filter keeps the header row in view, clear of the filter bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await runBatchQuery(page);
    await page.locator('.m-views [data-mview="results"]').tap();
    const onScreen = await page.evaluate(() => [...document.querySelectorAll('.th-btn')]
      .map((b, i) => (b.getBoundingClientRect().right <= window.innerWidth ? i : -1)).filter((i) => i >= 0));
    expect(onScreen.length, 'columns on screen').toBeGreaterThanOrEqual(3);
    for (const scrolled of [0, 40]) {
      for (const i of onScreen) {
        await page.locator('#results-container').evaluate((el, y) => { el.scrollTop = y; }, scrolled);
        await tapHeader(page, i);
        await expect(page.locator('.filt-pop')).toBeVisible();
        const open = await headerRow(page);
        const where = `column ${i}, rows scrolled ${scrolled}px`;
        expect({ inBox: open.inBox, clearOfBar: open.clearOfBar, bars: open.bars }, `${where}, filter open`).toEqual({ inBox: true, clearOfBar: true, bars: [] });
        await page.keyboard.press('Escape');
        await expect(page.locator('.filt-pop')).toHaveCount(0);
        const closed = await headerRow(page);
        expect({ bars: closed.bars, misses: closed.misses }, `${where}, filter closed`).toEqual({ bars: [], misses: [] });
      }
    }
  });
}
