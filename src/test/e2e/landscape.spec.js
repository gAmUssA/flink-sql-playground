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
