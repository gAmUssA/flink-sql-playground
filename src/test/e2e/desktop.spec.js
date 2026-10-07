'use strict';
// Desktop (1280x800, mouse) must keep the original layout: phone controls hidden, sidebar
// and both editors side by side, toolbar on one row, results below the editors.
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');

test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
});

test('phone-only controls are not rendered', async ({ page }) => {
  for (const sel of ['.m-views', '#tables-drawer-btn', '#drawer-backdrop']) {
    await expect(page.locator(sel)).toBeHidden();
  }
});

test('sidebar, editors, toolbar and results keep the desktop arrangement', async ({ page }) => {
  const g = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const tb = [...document.querySelectorAll('.toolbar > *')].filter((el) => el.getBoundingClientRect().width > 0);
    return {
      sidebarWidth: Math.round(box('#schema-browser').width),
      schemaLeftOfQuery: box('#schema-panel').right <= box('#query-panel').left + 1,
      sameRow: Math.abs(box('#schema-panel').top - box('#query-panel').top) < 1,
      toolbarOneRow: (() => {
        const centers = tb.map((el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2);
        return Math.max(...centers) - Math.min(...centers) < 2; // every item on the same row
      })(),
      resultsBelowToolbar: box('#results-panel').top >= box('.toolbar').bottom - 1,
      editorFontPx: parseFloat(getComputedStyle(document.querySelector('#query-editor .cm-content')).fontSize),
      buttonHeight: Math.round(box('#run-query-btn').height),
    };
  });
  expect(g).toEqual({ sidebarWidth: 248, schemaLeftOfQuery: true, sameRow: true, toolbarOneRow: true,
    resultsBelowToolbar: true, editorFontPx: 13.5, buttonHeight: g.buttonHeight });
  expect(g.buttonHeight).toBeLessThan(44);
});

test('the sidebar still collapses to a rail', async ({ page }) => {
  await page.click('#schema-browser-toggle');
  await expect.poll(() => page.locator('#schema-browser').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(44);
});

test('desktop panels are plain regions and the sidebar is fully reachable', async ({ page }) => {
  for (const id of ['schema-panel', 'query-panel', 'results-panel']) {
    await expect(page.locator(`#${id}`)).not.toHaveAttribute('role', 'tabpanel');
  }
  expect(await page.locator('#schema-browser').evaluate((el) => el.inert)).toBe(false);
  await expect(page.locator('#schema-browser')).not.toHaveAttribute('aria-hidden', 'true');
});

// At 1280x800 the popover does not fit below the results header (on main its buttons ran past
// the window's bottom edge), so it moves up; in a taller window it keeps its place below the header.
for (const [height, want] of [[800, { below: false, inside: true, scrolls: false }], [1100, { below: true, inside: true, scrolls: false }]]) {
  test(`the column filter stays inside a 1280x${height} window`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height });
    await page.click('#mode-segmented [data-mode="BATCH"]');
    await page.click('#run-query-btn');
    await expect(page.locator('.rv-table')).toBeVisible();
    await page.locator('.th-btn').first().click();
    const g = await page.evaluate(() => {
      const header = document.querySelector('.th-btn').getBoundingClientRect();
      const pop = document.querySelector('.filt-pop');
      const r = pop.getBoundingClientRect();
      const reach = (s) => { const q = pop.querySelector(s).getBoundingClientRect(); return q.top >= 0 && q.bottom <= window.innerHeight; };
      return { below: Math.abs(parseFloat(pop.style.top) - header.bottom - 7) < 1,
        inside: r.top >= 0 && r.bottom <= window.innerHeight && reach('.filt-v') && reach('[data-clear]') && reach('[data-apply]'),
        scrolls: pop.scrollHeight > pop.clientHeight };
    });
    expect(g).toEqual(want);
  });
}
