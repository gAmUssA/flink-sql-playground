'use strict';
// Phone layout: runs on the iPhone 13 (390x844), Pixel 7 (412x915) and 375x667 projects and on
// the rotated iPhone 13 (844x390) and Pixel 7 (915x412) projects, each in Chromium and WebKit
// (see playwright.config.js).
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');
const { setEditorText, waitForSettledCompletion } = require('./completion');
const { fontsReady } = require('./layout');
const { runManyRows, runRetractions, scrollResults, headerHits, openEachFilter, changelogReach, opTogglesWork } = require('./results-bars');

const PRIMARY_ACTIONS = ['#build-schema-btn', '#run-query-btn', '#mode-segmented [data-mode="STREAMING"]',
  '#mode-segmented [data-mode="BATCH"]', '#example-select', '#share-btn'];
const MIN_TARGET = 44;

async function openApp(page) {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
}

async function runBatchQuery(page) {
  await page.locator('#mode-segmented [data-mode="BATCH"]').tap();
  await page.locator('#run-query-btn').tap();
  await expect(page.locator('.rv-table')).toBeVisible();
}

async function expectNoHorizontalScroll(page) {
  await fontsReady(page);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));
  expect(overflow.doc, 'document must not scroll sideways').toBeLessThanOrEqual(0);
  expect(overflow.body, 'body must not scroll sideways').toBeLessThanOrEqual(0);
}

/** Every visible interactive control outside the code editor, with its size. */
async function visibleControls(page) {
  await fontsReady(page);
  return page.evaluate(() => {
    const sel = 'button, select, input, a[href], [role="tab"], [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(sel)]
      .filter((el) => !el.closest('.cm-editor'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
          && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { what: el.id || el.className || el.tagName, text: (el.textContent || '').trim().slice(0, 24),
          width: Math.round(r.width), height: Math.round(r.height) };
      });
  });
}

async function expectTouchTargets(page) {
  const small = (await visibleControls(page)).filter((c) => c.width < MIN_TARGET || c.height < MIN_TARGET);
  expect(small, `controls smaller than ${MIN_TARGET}px`).toEqual([]);
}

/** Inside the viewport and actually hit by a tap at its centre (not covered by anything). */
async function expectTappable(page, selector) {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible();
  await fontsReady(page);
  const box = await el.boundingBox();
  const vp = page.viewportSize();
  expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${selector} top edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, `${selector} bottom edge`).toBeLessThanOrEqual(vp.height);
  const hit = await page.evaluate(({ s, x, y }) => {
    const target = document.querySelector(s);
    const top = document.elementFromPoint(x, y);
    return !!top && (top === target || target.contains(top));
  }, { s: selector, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(hit, `${selector} is covered by another element`).toBe(true);
}

/**
 * The open column filter sits inside the window, and its input, Clear and Apply can each be
 * reached: scrolled into view inside the popover if it had to cap its height, then tappable.
 */
async function expectFilterInsideWindow(page) {
  const pop = page.locator('.filt-pop');
  await expect(pop).toBeVisible();
  await fontsReady(page);
  const vp = page.viewportSize();
  const box = await pop.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  expect(box.top, 'popover top edge').toBeGreaterThanOrEqual(0);
  expect(box.bottom, 'popover bottom edge').toBeLessThanOrEqual(vp.height);
  for (const sel of ['.filt-pop .filt-v', '.filt-pop [data-clear]', '.filt-pop [data-apply]']) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    await expectTappable(page, sel);
  }
}

test.beforeEach(async ({ page }) => { await openApp(page); });

test('runs as a touch device that meets the phone criterion', async ({ page }) => {
  const env = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    phone: matchMedia(PHONE_QUERY).matches,
  }));
  expect(env).toEqual({ coarse: true, phone: true });
});

test('viewport meta resizes content for the keyboard and the app fills the dynamic viewport', async ({ page }) => {
  const meta = await page.getAttribute('meta[name="viewport"]', 'content');
  expect(meta).toContain('interactive-widget=resizes-content');
  expect(meta).toContain('width=device-width');
  const { appHeight, innerHeight, usesDvh } = await page.evaluate(() => {
    // Cross-origin sheets (Google Fonts) refuse cssRules with a SecurityError; anything else is a bug.
    const readable = [...document.styleSheets].flatMap((s) => {
      try { return [...s.cssRules]; } catch (e) { if (e.name !== 'SecurityError') throw e; return []; }
    });
    const rule = readable.find((r) => r.selectorText === '.app' && r.cssText.includes('100dvh'));
    return { appHeight: document.querySelector('.app').getBoundingClientRect().height,
      innerHeight: window.innerHeight, usesDvh: !!rule };
  });
  expect(usesDvh).toBe(true);
  expect(Math.abs(appHeight - innerHeight)).toBeLessThanOrEqual(1);
});

test('Schema, Query and Results are tabs showing one panel at a time', async ({ page }) => {
  const views = page.locator('.m-views [role="tab"]');
  await expect(views).toHaveText([/Schema/, /Query/, /Results/]);
  await expect(page.locator('#query-panel')).toBeVisible();
  await expect(page.locator('#schema-panel')).toBeHidden();
  await expect(page.locator('#results-panel')).toBeHidden();

  await views.filter({ hasText: 'Schema' }).tap();
  await expect(page.locator('#schema-panel')).toBeVisible();
  await expect(page.locator('#query-panel')).toBeHidden();
  await expect(views.filter({ hasText: 'Schema' })).toHaveAttribute('aria-selected', 'true');

  await views.filter({ hasText: 'Results' }).tap();
  await expect(page.locator('#results-panel')).toBeVisible();
  await expect(page.locator('#schema-panel')).toBeHidden();
  await expect(page.locator('#query-panel')).toBeHidden();
});

test('running a query switches to Results and counts the rows', async ({ page }) => {
  await runBatchQuery(page);
  await expect(page.locator('.m-views [data-mview="results"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#m-views-count')).toHaveText('5');
});

test('Tables is a drawer that opens over the page and closes again', async ({ page }) => {
  const drawer = page.locator('#schema-browser');
  const isOnScreen = async () => drawer.evaluate((el) => el.getBoundingClientRect().right > 1);
  expect(await isOnScreen()).toBe(false);

  await page.locator('#tables-drawer-btn').tap();
  await expect(page.locator('#drawer-backdrop')).toBeVisible();
  await expect.poll(isOnScreen).toBe(true);
  await expect(page.locator('#tables-drawer-btn')).toHaveAttribute('aria-expanded', 'true');
  await expectNoHorizontalScroll(page);

  await page.locator('#drawer-backdrop').tap({ position: { x: page.viewportSize().width - 10, y: 200 } });
  await expect.poll(isOnScreen).toBe(false);
  await expect(page.locator('#drawer-backdrop')).toBeHidden();
});

test('Run, Build, Mode, Preset and Share are one tap away in every view', async ({ page }) => {
  for (const view of ['query', 'schema', 'results']) {
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    for (const sel of PRIMARY_ACTIONS) await expectTappable(page, sel);
  }
  await runBatchQuery(page);
  for (const sel of PRIMARY_ACTIONS) await expectTappable(page, sel);
});

test('no horizontal page scroll in any view, with or without results', async ({ page }) => {
  for (const view of ['query', 'schema', 'results']) {
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    await expectNoHorizontalScroll(page);
  }
  await runBatchQuery(page);
  for (const tab of ['table', 'changelog', 'throughput', 'graph']) {
    await page.locator(`.rtab[data-tab="${tab}"]`).tap();
    await expectNoHorizontalScroll(page);
  }
});

test('every visible control is at least 44px in each view', async ({ page }) => {
  for (const view of ['query', 'schema', 'results']) {
    await page.locator(`.m-views [data-mview="${view}"]`).tap();
    await expectTouchTargets(page);
  }
  await runBatchQuery(page);
  await expectTouchTargets(page);
  await page.locator('.rtab[data-tab="changelog"]').tap();
  await expectTouchTargets(page);
  await page.locator('#tables-drawer-btn').tap();
  await expectTouchTargets(page);
});

test('text inputs and the editor use at least 16px so iOS does not zoom on focus', async ({ page }) => {
  await runBatchQuery(page);
  await page.locator('.rtab[data-tab="changelog"]').tap();
  const sizes = await page.evaluate(() => {
    const fields = [...document.querySelectorAll('select, input, textarea')]
      .filter((el) => el.getBoundingClientRect().width > 0 && !el.closest('.cm-editor'));
    const editorLine = document.querySelector('#query-editor .cm-content');
    return { fields: fields.map((el) => ({ what: el.id || el.className, px: parseFloat(getComputedStyle(el).fontSize) })),
      editor: parseFloat(getComputedStyle(editorLine).fontSize) };
  });
  expect(sizes.fields.length).toBeGreaterThan(0);
  expect(sizes.fields.filter((f) => f.px < 16)).toEqual([]);
  expect(sizes.editor).toBeGreaterThanOrEqual(16);
});

test('wide results keep the first column pinned and scroll inside the panel', async ({ page }) => {
  await runBatchQuery(page);
  await fontsReady(page);
  const layout = await page.evaluate(() => {
    const body = document.getElementById('results-container');
    const firstData = document.querySelector('.rv-table tbody tr td:nth-child(2)');
    const rowNum = document.querySelector('.rv-table tbody tr td.rv-rownum');
    return { tableWider: body.scrollWidth > body.clientWidth, position: getComputedStyle(firstData).position,
      left: getComputedStyle(firstData).left, rowNumHidden: getComputedStyle(rowNum).display === 'none' };
  });
  expect(layout).toEqual({ tableWider: true, position: 'sticky', left: '0px', rowNumHidden: true });

  const before = await page.locator('.rv-table tbody tr td:nth-child(2)').first().boundingBox();
  await page.locator('#results-container').evaluate((el) => { el.scrollLeft = 400; });
  const after = await page.locator('.rv-table tbody tr td:nth-child(2)').first().boundingBox();
  expect(Math.round(after.x)).toBe(Math.round(before.x));
  await expectNoHorizontalScroll(page);
});

test('view tabs follow the ARIA tabs pattern with arrow-key navigation', async ({ page }) => {
  const tab = (v) => page.locator(`.m-views [data-mview="${v}"]`);
  for (const [v, panel] of [['schema', 'schema-panel'], ['query', 'query-panel'], ['results', 'results-panel']]) {
    await expect(tab(v)).toHaveAttribute('aria-controls', panel);
    await expect(page.locator(`#${panel}`)).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator(`#${panel}`)).toHaveAttribute('aria-labelledby', `m-tab-${v}`);
  }
  // Only the selected tab is a Tab stop.
  await expect(tab('query')).toHaveAttribute('tabindex', '0');
  await expect(tab('schema')).toHaveAttribute('tabindex', '-1');

  await tab('query').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('results')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('results')).toBeFocused();
  await expect(page.locator('#results-panel')).toBeVisible();
  await page.keyboard.press('ArrowRight'); // wraps around
  await expect(tab('schema')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab('results')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('schema')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('schema')).toHaveAttribute('tabindex', '0');
  await expect(tab('results')).toHaveAttribute('tabindex', '-1');
});

test('the closed drawer is out of the tab order; Esc closes it and returns focus', async ({ page }) => {
  const drawer = page.locator('#schema-browser');
  expect(await drawer.evaluate((el) => el.inert)).toBe(true);
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');

  await page.locator('#tables-drawer-btn').tap();
  expect(await drawer.evaluate((el) => el.inert)).toBe(false);
  await expect(drawer).not.toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => document.getElementById('schema-browser').contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  expect(await drawer.evaluate((el) => el.inert)).toBe(true);
  await expect(page.locator('#tables-drawer-btn')).toBeFocused();
});

test('tapping the backdrop closes the drawer and returns focus to the Tables button', async ({ page }) => {
  await page.locator('#tables-drawer-btn').tap();
  await expect(page.locator('#drawer-backdrop')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('schema-browser').contains(document.activeElement))).toBe(true);
  await page.locator('#drawer-backdrop').tap({ position: { x: page.viewportSize().width - 10, y: 200 } });
  await expect(page.locator('#drawer-backdrop')).toBeHidden();
  expect(await page.locator('#schema-browser').evaluate((el) => el.inert)).toBe(true);
  await expect(page.locator('#tables-drawer-btn')).toBeFocused();
});

test('the guided tour is not offered on phones', async ({ page }) => {
  await expect(page.locator('#tour-btn')).toBeHidden();
});

test('the toolbar puts Build + Run first; upright, mode / preset / share wrap to the next row', async ({ page }) => {
  await runBatchQuery(page);
  await fontsReady(page);
  const layout = await page.evaluate(() => {
    // Vertical centre: controls on one flex row share it even when their heights differ.
    const row = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top + r.height / 2; };
    const clipped = [...document.querySelectorAll('.toolbar .btn')].filter((el) => el.offsetWidth > 0)
      .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.id);
    return {
      firstRow: [row('#build-schema-btn'), row('#run-query-btn')],
      secondRow: [row('#mode-segmented'), row('.tb-select'), row('#share-btn')],
      clipped,
    };
  });
  const sameRow = (centres) => Math.max(...centres) - Math.min(...centres) < 2;
  expect(sameRow(layout.firstRow)).toBe(true);
  expect(sameRow(layout.secondRow)).toBe(true);
  const { width, height } = page.viewportSize();
  if (height > width) expect(Math.min(...layout.secondRow)).toBeGreaterThan(Math.max(...layout.firstRow) + 20);
  else expect(sameRow([...layout.firstRow, ...layout.secondRow]), 'sideways, the whole toolbar fits one row').toBe(true);
  expect(layout.clipped).toEqual([]);
  await expect(page.locator('#sb-phone-status')).toBeVisible();
  await expect(page.locator('#sb-phone-status-text')).toHaveText(/5 rows in 12ms/);
});

test('a query with no rows still shows a 0 count on the Results tab', async ({ page }) => {
  await expect(page.locator('#m-views-count')).toBeHidden();
  await page.evaluate(() => queryEditor.setValue('SELECT * FROM orders WHERE 1 = 0'));
  await page.locator('#mode-segmented [data-mode="BATCH"]').tap();
  await page.locator('#run-query-btn').tap();
  await expect(page.locator('#m-views-count')).toBeVisible();
  await expect(page.locator('#m-views-count')).toHaveText('0');
});

test('keyboard focus stays inside the open drawer', async ({ page }) => {
  await page.locator('#tables-drawer-btn').tap();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('schema-browser').contains(document.activeElement)
      || document.activeElement === document.body)).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.getElementById('schema-browser').contains(document.activeElement)
      || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press('Escape');
  expect(await page.locator('.editors').evaluate((el) => el.inert)).toBe(false);
  await expect(page.locator('#tables-drawer-btn')).toBeFocused();
});


test('opening the drawer closes the Tweaks panel and the column filter above it', async ({ page }) => {
  await page.locator('#tweaks-btn').tap();
  await expect(page.locator('#tweaks-panel')).toBeVisible();
  await page.locator('#tables-drawer-btn').tap();
  await expect(page.locator('#tweaks-panel')).toBeHidden();
  await page.keyboard.press('Escape');

  await runBatchQuery(page);
  await page.locator('.th-btn').first().tap();
  await expect(page.locator('.filt-pop')).toBeVisible();
  await page.locator('#tables-drawer-btn').tap();
  await expect(page.locator('.filt-pop')).toHaveCount(0);
});

test('the column filter keeps its input, Clear and Apply inside the window', async ({ page }) => {
  await runBatchQuery(page);
  await page.locator('.th-btn').first().tap();
  await expectFilterInsideWindow(page);
});

test('a column suggestion appears while typing and inserts on tap', async ({ page }) => {
  await page.locator('#build-schema-btn').tap();
  await expect(page.locator('#sb-phone-status-text')).toHaveText('Schema built');
  await page.locator('#query-editor .cm-content').tap();
  await setEditorText(page, 'query', 'SELECT regi', { typed: true });
  await waitForSettledCompletion(page, 'query');
  const option = page.locator('.cm-tooltip-autocomplete li', { has: page.locator('.cm-completionLabel', { hasText: /^region$/ }) });
  await expect(option).toBeVisible();
  await fontsReady(page);
  const box = await option.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(40);
  await option.tap();
  await expect.poll(() => page.evaluate(() => queryEditor.getValue())).toBe('SELECT region');
});

// On main, wherever the filter bar stays pinned (upright phones), the column headers slid under
// it once the rows scrolled, and the bar took their taps (#68). Sideways the bar scrolls away.
test('with the rows scrolled, every column header stays clear of the filter bar and opens its filter on tap', async ({ page }) => {
  await runManyRows(page, true);
  for (const top of [0, 40, 'end']) {
    await scrollResults(page, top);
    const h = await headerHits(page);
    expect({ bars: h.bars, misses: h.misses, under: h.under }, `rows scrolled ${top}`).toEqual({ bars: [], misses: [], under: [] });
    expect(h.points.length, 'headers on screen').toBeGreaterThanOrEqual(2);
    expect(await openEachFilter(page, true, top), `rows scrolled ${top}`).toMatchObject({ failed: [] });
  }
});

test('a filter bar wrapped around its chips keeps the headers below it while the rows scroll', async ({ page }) => {
  await runManyRows(page, true);
  for (const [col, value] of [[1, 'region'], [7, 'A']]) {
    await page.locator('.th-btn').nth(col).evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    await page.locator('.th-btn').nth(col).tap();
    await page.locator('.filt-pop .filt-v').fill(value);
    await page.locator('.filt-pop [data-apply]').tap();
  }
  await expect(page.locator('.rv-chip')).toHaveCount(2);
  await scrollResults(page, 80);
  const g = await page.evaluate(() => {
    const bar = document.querySelector('.rv-filterbar');
    return { pinned: getComputedStyle(bar).position === 'sticky', barH: bar.getBoundingClientRect().height,
      barBottom: bar.getBoundingClientRect().bottom, head: document.querySelector('.th-btn').getBoundingClientRect().top };
  });
  if (g.pinned) {
    expect(g.barH, 'the chips wrap onto more rows').toBeGreaterThan(60);
    expect(g.head, 'header top at the bar bottom').toBeCloseTo(g.barBottom, 0);
  }
  const h = await headerHits(page);
  expect({ bars: h.bars, misses: h.misses, under: h.under }).toEqual({ bars: [], misses: [], under: [] });
});

// The first column and its header stay pinned at the left; scrolled both ways, the header corner
// stays above the pinned cells and the other headers, and no row shows above the header row where
// the bar has moved off to the left.
test('scrolled sideways and down, the pinned first column and its header corner keep their layering', async ({ page }) => {
  await runManyRows(page, true);
  await scrollResults(page, 120, 300);
  const g = await page.evaluate(() => {
    const box = document.getElementById('results-container');
    const b = box.getBoundingClientRect();
    const btns = [...document.querySelectorAll('.th-btn')];
    const corner = btns[0].getBoundingClientRect();
    const at = (x, y) => document.elementFromPoint(x, y);
    const cornerHit = at(corner.left + 8, corner.top + corner.height / 2);
    const keyCell = at(corner.left + 8, corner.bottom + 12);
    const other = btns.findIndex((x, i) => i > 0 && x.getBoundingClientRect().left > corner.right + 8 && x.getBoundingClientRect().right < b.right);
    const o = btns[other].getBoundingClientRect();
    const otherHit = at((Math.max(o.left, corner.right) + Math.min(o.right, b.right)) / 2, o.top + o.height / 2);
    // Above the header row, at the right edge of the box: the bar, or what fills its place.
    const above = corner.top > b.top + 4 ? at(b.right - 12, (b.top + corner.top) / 2) : null;
    return { scrolled: box.scrollTop > 0 && box.scrollLeft > 0,
      corner: !!cornerHit && cornerHit.closest('.th-btn') === btns[0],
      keyCell: !!keyCell && !!keyCell.closest('tbody td') && keyCell.closest('td').cellIndex === 1,
      otherHeader: !!otherHit && otherHit.closest('.th-btn') === btns[other],
      noRowAbove: !above || !above.closest('tbody') };
  });
  expect(g).toEqual({ scrolled: true, corner: true, keyCell: true, otherHeader: true, noRowAbove: true });
});

// The changelog's bar (op toggles and search) is pinned where the box leaves room below it for a
// whole row, and scrolls away with the rows elsewhere. On main it stayed pinned on a 375x667 phone,
// whose rows wrap to 247px under a 198px bar in a 367px box, so no row ever showed whole (#68),
// and on a phone held sideways (#69).
test('after a streaming run, every changelog row can be scrolled into view whole, clear of the bar', async ({ page }) => {
  await runRetractions(page, true);
  const r = await changelogReach(page);
  expect(r.rows).toBe(8);
  expect(r.atEnd, 'whole rows shown after the run').toBeGreaterThanOrEqual(1);
  expect(r.unreachable, 'rows never shown whole').toEqual([]);
  expect(await opTogglesWork(page), 'op toggles reachable at the top').toEqual({ ops: 4, failed: [] });
});
