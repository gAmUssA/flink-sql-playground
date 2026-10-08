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

// A window where the popover ends 1-9px above the bottom edge: it fits, so it keeps its place
// 7px under the header rather than moving up to a 10px margin. The popover's height depends on
// the fonts the platform renders (about 1440x900 on macOS), so the test searches for that height.
test('the column filter keeps its place when it fits with less than 10px to spare', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#mode-segmented [data-mode="BATCH"]');
  await page.click('#run-query-btn');
  await expect(page.locator('.rv-table')).toBeVisible();
  await page.locator('.th-btn').first().click();
  const popHeight = await page.locator('.filt-pop').evaluate((el) => el.offsetHeight);
  await page.keyboard.press('Escape');
  await expect(page.locator('.filt-pop')).toHaveCount(0);
  // Space left below the popover if it opened 7px under the header at the current window height.
  const spare = () => page.evaluate((h) => window.innerHeight - (document.querySelector('.th-btn').getBoundingClientRect().bottom + 7 + h), popHeight);
  let height = 900;
  for (let i = 0; i < 200; i++) {
    const left = await spare();
    if (left >= 3 && left <= 7) break;
    height += left < 3 ? 1 : -1;
    await page.setViewportSize({ width: 1440, height });
  }
  const left = await spare();
  expect(left, `the popover ends 1-9px above the edge of a 1440x${height} window`).toBeGreaterThanOrEqual(1);
  expect(left, `the popover ends 1-9px above the edge of a 1440x${height} window`).toBeLessThanOrEqual(9);

  await page.locator('.th-btn').first().click();
  // Measure the settled box, not one shifted by the open animation.
  await page.locator('.filt-pop').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const g = await page.evaluate(() => {
    const header = document.querySelector('.th-btn').getBoundingClientRect();
    const pop = document.querySelector('.filt-pop');
    const r = pop.getBoundingClientRect();
    return { gap: parseFloat(pop.style.top) - header.bottom, inside: r.top >= 0 && r.bottom <= window.innerHeight };
  });
  expect(Math.abs(g.gap - 7), 'popover sits 7px under its header').toBeLessThan(1);
  expect(g.inside).toBe(true);
});

/**
 * WCAG contrast of each element's text against the background it is drawn on, as rendered: the
 * element's own and its ancestors' background colours composited from the root down, with each
 * `opacity` below 1 blending its subtree into what lies behind it. Colours are resolved through a
 * canvas, so color-mix() and alpha work whatever syntax the browser reports.
 */
function measureContrast(targets) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1); g.fillStyle = css; g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data; return [r, gr, b, a / 255];
  };
  const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
  const mix = (a, b, t) => a.map((c, i) => c * t + b[i] * (1 - t));
  // The colour of one pixel of `content` (or of the background, when content is fully
  // transparent) drawn inside path[i..], with `under` showing behind path[i].
  const render = (path, i, under, content) => {
    const s = getComputedStyle(path[i]);
    const inside = over(rgba(s.backgroundColor), under);
    const drawn = i === path.length - 1 ? over(content, inside) : render(path, i + 1, inside, content);
    return mix(drawn, under, parseFloat(s.opacity));
  };
  const lum = (rgb) => {
    const [r, g2, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g2 + 0.0722 * b;
  };
  return targets.map(({ what, el }) => {
    const path = [];
    for (let n = el; n; n = n.parentElement) path.unshift(n);
    const bg = render(path, 0, [255, 255, 255], [0, 0, 0, 0]);
    const fg = render(path, 0, [255, 255, 255], rgba(getComputedStyle(el).color));
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return { what, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fg: fg.map(Math.round), bg: bg.map(Math.round) };
  });
}

/**
 * Waits for the page's finite animations (cards and rows fading in) to end, so opacity is settled.
 * An animation whose element a re-render removed is cancelled: nothing of it is left to settle.
 */
async function settleAnimations(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect.getComputedTiming().endTime !== Infinity)
    .map((a) => a.finished.catch((e) => { if (e.name !== 'AbortError') throw e; }))));
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
    await settleAnimations(page);
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
    await settleAnimations(page);
    const second = await page.evaluate((fn) => new Function(`return (${fn})`)()([
      { what: 'column type', el: document.querySelector('.rv-coltype') },
      { what: 'drop note', el: document.querySelector('.tbl-confirm-note') },
      { what: 'drop punctuation', el: document.querySelector('.tbl-confirm-sql .tk-pun') },
    ]), measureContrast.toString());

    const low = [...first, ...second].filter((m) => m.ratio < 4.5);
    expect(low, `${theme}: text below 4.5:1`).toEqual([]);
  });
}

// After a streaming run whose changelog holds all four ops: each op's toggle (its mark, label and
// count), row mark, row label and cells, then a toggle switched off.
for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme}: the changelog's op toggles and rows reach 4.5:1 after a run`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fsf-tweaks-v2', JSON.stringify({ theme: t, themeExplicit: true })), theme);
    await page.reload();
    await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => queryEditor.setValue('-- stub: retractions\nSELECT * FROM orders'));
    await page.click('#mode-segmented [data-mode="STREAMING"]');
    await page.click('#run-query-btn');
    await expect(page.locator('#run-query-btn')).toBeEnabled();
    await page.click('.rtab[data-tab="changelog"]');
    await expect(page.locator('.rv-log-row')).toHaveCount(8);
    const toggles = (fn) => page.evaluate((f) => new Function(`return (${f})`)()([...document.querySelectorAll('.rv-op-toggle')].flatMap((t) => {
      const state = `${t.dataset.clop} toggle (${t.classList.contains('is-on') ? 'on' : 'off'})`;
      return [{ what: `${state} mark`, el: t.querySelector('.rv-op-toggle-mark') }, { what: `${state} label`, el: t.querySelector('.rv-op-toggle-label') },
        { what: `${state} count`, el: t.querySelector('.rv-op-toggle-n') }];
    })), fn);
    await settleAnimations(page);
    const rows = await page.evaluate((fn) => new Function(`return (${fn})`)()(['+I', '-U', '+U', '-D'].flatMap((op) => {
      const row = [...document.querySelectorAll('.rv-log-row')].find((r) => r.querySelector('.rv-op').textContent === op);
      return [{ what: `${op} row mark`, el: row.querySelector('.rv-op') }, { what: `${op} row label`, el: row.querySelector('.rv-op-label') },
        { what: `${op} row cell`, el: row.querySelector('.rv-log-cell') }, { what: `${op} row column name`, el: row.querySelector('.rv-log-cell i') }];
    })), measureContrast.toString());
    const on = await toggles(measureContrast.toString());
    // Each toggle switched off in turn, the -U toggle included.
    const off = [];
    for (const op of ['+I', '-U', '+U', '-D']) {
      await page.locator(`.rv-op-toggle[data-clop="${op}"]`).click();
      await settleAnimations(page);
      off.push(...(await toggles(measureContrast.toString())).filter((x) => x.what.startsWith(`${op} toggle (off)`)));
      await page.locator(`.rv-op-toggle[data-clop="${op}"]`).click();
    }
    expect([rows.length, on.length, off.length]).toEqual([16, 12, 12]);
    const low = [...rows, ...on, ...off].filter((x) => x.ratio < 4.5);
    expect(low, `${theme}: changelog text below 4.5:1`).toEqual([]);
  });
}
