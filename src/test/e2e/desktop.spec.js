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

// At 1440x900 the popover ends 1-9px above the window's bottom edge: it fits, so it keeps its
// place 7px under the header rather than moving up to a 10px margin.
test('the column filter keeps its place when it fits with less than 10px to spare', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#mode-segmented [data-mode="BATCH"]');
  await page.click('#run-query-btn');
  await expect(page.locator('.rv-table')).toBeVisible();
  await page.locator('.th-btn').first().click();
  // Measure the settled box, not one shifted by the open animation.
  await page.locator('.filt-pop').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const g = await page.evaluate(() => {
    const header = document.querySelector('.th-btn').getBoundingClientRect();
    const pop = document.querySelector('.filt-pop');
    const r = pop.getBoundingClientRect();
    return { spare: window.innerHeight - (header.bottom + 7 + pop.offsetHeight), gap: parseFloat(pop.style.top) - header.bottom,
      inside: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  expect(g.spare, 'the popover ends 1-9px above the window edge').toBeGreaterThanOrEqual(1);
  expect(g.spare, 'the popover ends 1-9px above the window edge').toBeLessThanOrEqual(9);
  expect(Math.abs(g.gap - 7), 'popover sits 7px under its header').toBeLessThan(1);
  expect(g.inside).toBe(true);
});

/**
 * WCAG contrast of each element's text against the background it is drawn on: the element's own
 * and its ancestors' background colours, composited until one is opaque. Colours are resolved
 * through a canvas, so color-mix() and alpha work whatever syntax the browser reports.
 * It ignores `opacity` on the element and its ancestors, so it overstates contrast for dimmed text.
 */
function measureContrast(targets) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1); g.fillStyle = css; g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data; return [r, gr, b, a / 255];
  };
  const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
  const background = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    return layers.reverse().reduce((under, top) => over(top, under), [255, 255, 255]);
  };
  const lum = (rgb) => {
    const [r, g2, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g2 + 0.0722 * b;
  };
  return targets.map(({ what, el }) => {
    const bg = background(el);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return { what, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fg: fg.map(Math.round), bg: bg.map(Math.round) };
  });
}

for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme}: muted text, line numbers, comments, types and punctuation reach 4.5:1`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fsf-tweaks-v2', JSON.stringify({ theme: t, themeExplicit: true })), theme);
    await page.reload();
    await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => queryEditor.setValue('-- top regions\nSELECT CAST(user_id AS INT) FROM orders'));
    await page.click('#build-schema-btn');
    await expect(page.locator('.tbl-col-type').first()).toBeVisible();
    // Before a run: the results tabs, the empty-state hint and the status bar use --text-3.
    const first = await page.evaluate((fn) => {
      const measure = new Function(`return (${fn})`)();
      const root = getComputedStyle(document.documentElement);
      const same = (el, token) => {
        const probe = document.createElement('span'); probe.style.color = root.getPropertyValue(token); document.body.appendChild(probe);
        const want = getComputedStyle(probe).color; probe.remove();
        return getComputedStyle(el).color === want;
      };
      const spans = [...document.querySelectorAll('#query-editor .cm-line span')];
      return measure([
        ...[...document.querySelectorAll('.rtab:not(.is-active)')].map((el) => ({ what: 'results tab', el })),
        { what: 'empty-state hint', el: document.querySelector('.rv-empty-hint') },
        { what: 'status bar', el: document.querySelector('#sb-state') },
        { what: 'line number', el: document.querySelector('#query-editor .cm-gutterElement:not(.cm-activeLineGutter)') },
        { what: 'comment', el: spans.find((el) => same(el, '--tk-com')) },
        { what: 'type name', el: spans.find((el) => same(el, '--tk-ty')) },
        { what: 'sidebar column type', el: document.querySelector('.tbl-col-type') },
        { what: 'sidebar table kind', el: document.querySelector('.tbl-kind') },
      ].map((t) => { if (!t.el) throw new Error(`no element for ${t.what}`); return t; }));
    }, measureContrast.toString());

    await page.click('#mode-segmented [data-mode="BATCH"]');
    await page.click('#run-query-btn');
    await expect(page.locator('.rv-table')).toBeVisible();
    await page.locator('.tbl-card').first().hover();
    await page.locator('.tbl-drop').first().click();
    await expect(page.locator('.tbl-confirm')).toBeVisible();
    const second = await page.evaluate((fn) => new Function(`return (${fn})`)()([
      { what: 'column type', el: document.querySelector('.rv-coltype') },
      { what: 'drop note', el: document.querySelector('.tbl-confirm-note') },
      { what: 'drop punctuation', el: document.querySelector('.tbl-confirm-sql .tk-pun') },
    ]), measureContrast.toString());

    const low = [...first, ...second].filter((m) => m.ratio < 4.5);
    expect(low, `${theme}: text below 4.5:1`).toEqual([]);
  });
}
