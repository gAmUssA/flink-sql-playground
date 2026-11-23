'use strict';
// embed.html inside an <iframe> on another origin (ADR 0008): the compact layout, no session until
// the first Run, the cold-start state, autorun, the tab param, Open in playground, the Share menu's
// embed code, hostile links, themes and touch targets. The API is stubbed (stub-api.js).
const { test, expect } = require('@playwright/test');
const { stubApi } = require('./stub-api');
const { measureContrast, settleAnimations } = require('./contrast');
const FiddleLink = require('../../main/resources/META-INF/resources/js/fiddle-link.js');
const zlib = require('node:zlib');
const http = require('node:http');

const PORT = Number(process.env.E2E_PORT || 8790);
const APP = `http://127.0.0.1:${PORT}`;

const FIDDLE = {
  schema: 'CREATE TEMPORARY TABLE orders (\n  user_id INT,\n  amount DOUBLE\n) WITH (\n  \'connector\' = \'faker\'\n);',
  query: 'SELECT user_id, amount FROM orders',
  mode: 'STREAMING',
};
let fragment;
// The blog: a second server on another port, so the iframe is cross-origin like a real embed. (Chromium
// refuses to frame a loopback page from a route-fulfilled one, so this is a real listener.)
let blog; let blogHtml = '';
let HOST;
test.beforeAll(async () => {
  fragment = await FiddleLink.encode(FIDDLE);
  blog = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }).end(blogHtml); });
  await new Promise((resolve) => blog.listen(0, '127.0.0.1', resolve));
  HOST = `http://127.0.0.1:${blog.address().port}`;
});
test.afterAll(() => new Promise((resolve) => blog.close(resolve)));

/** The embed URL for the app origin. */
const embedSrc = (query = '', frag = fragment) => `${APP}/embed.html${query}#${frag}`;

/**
 * A page on another origin holding iframes. `frames` is a list of {src, width, height, top} where top
 * pushes the frame down the page. Returns the page's frame locators' selectors.
 */
async function hostPage(page, frames) {
  blogHtml = `<!doctype html><body style="margin:0">${frames.map((f, i) => `<iframe id="e${i}" src="${f.src}" loading="eager" `
      + `style="display:block;border:0;width:${f.width || 400}px;height:${f.height || 500}px;margin-top:${f.top || 0}px;${f.style || ''}"></iframe>`).join('')}</body>`;
  await page.goto(`${HOST}/host`);
}
const frameOf = (page, i = 0) => page.frameLocator(`#e${i}`);
const ready = async (page, i = 0) => {
  const f = frameOf(page, i);
  await expect(f.locator('.cm-editor')).toHaveCount(2);
  await expect(f.locator('#status-text')).not.toHaveText('');
  return f;
};

/** Every /api request the page and its frames make. */
function apiCalls(page) {
  const calls = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) calls.push(`${r.method()} ${u.pathname}`); });
  return calls;
}

async function open(page, frames, { wakePause = 50 } = {}) {
  await page.addInitScript((ms) => { window.EMBED_WAKE_PAUSE_MS = ms; }, wakePause);
  await stubApi(page);
  const calls = apiCalls(page);
  await hostPage(page, frames);
  return calls;
}

for (const size of [{ width: 400, height: 500 }, { width: 800, height: 600 }]) {
  test(`embed at ${size.width}x${size.height}: editor, Run and results, no app chrome`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'the iframe has its own size; the phone project covers touch targets');
    await open(page, [{ src: embedSrc(), ...size }]);
    const f = await ready(page);
    await expect(f.locator('#query-editor .cm-content')).toContainText('SELECT user_id, amount FROM orders');
    for (const gone of ['.topbar', '.sidebar', '#tour-btn', '#tweaks-btn', '#theme-toggle', '#share-btn', '#example-select', '.m-views', '.statusbar', '#build-schema-btn', '.panel-maximize-btn']) {
      await expect(f.locator(gone), gone).toHaveCount(0);
    }
    await expect(f.locator('#schema-panel')).toBeHidden();
    await expect(f.locator('#run-query-btn')).toBeVisible();
    await expect(f.locator('#embed-open')).toBeVisible();
    await expect(f.locator('#status-text')).toBeVisible();
    // Everything fits the iframe: no horizontal scroll, and the results get real room.
    const fit = await f.locator('body').evaluate((b) => ({
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      overflowY: document.documentElement.scrollHeight - window.innerHeight,
      results: document.getElementById('results-container').getBoundingClientRect().height,
      runRight: document.getElementById('run-query-btn').getBoundingClientRect().right,
      openRight: document.getElementById('embed-open').getBoundingClientRect().right,
      width: window.innerWidth,
    }));
    expect(fit.overflowX).toBeLessThanOrEqual(0);
    expect(fit.overflowY).toBeLessThanOrEqual(0);
    expect(fit.results).toBeGreaterThanOrEqual(size.height >= 600 ? 200 : 120);
    expect(fit.openRight).toBeLessThanOrEqual(fit.width);

    await f.locator('#run-query-btn').click();
    await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
    // With rows on screen the panels still add up to the iframe: the status line stays visible at the
    // bottom and the editor does not run into the tabs, in the table and in the changelog.
    for (const tab of ['table', 'changelog']) {
      await f.locator(`.rtab[data-tab="${tab}"]`).click();
      const box = await f.locator('body').evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { height: window.innerHeight, editorBottom: r('.embed-editors').bottom, tabsTop: r('.results-head').top,
          footBottom: r('.embed-foot').bottom, footTop: r('.embed-foot').top, bodyBottom: r('#results-container').bottom, bodyHeight: r('#results-container').height };
      });
      expect(box.footBottom, `${tab}: status line inside the iframe`).toBeLessThanOrEqual(box.height);
      expect(box.editorBottom, `${tab}: editor above the tabs`).toBeLessThanOrEqual(box.tabsTop + 1);
      expect(box.bodyBottom, `${tab}: results above the status line`).toBeLessThanOrEqual(box.footTop + 1);
      expect(box.bodyHeight, `${tab}: results room`).toBeGreaterThanOrEqual(90);
    }
    await expect(f.locator('#status-text')).toBeVisible();
    await expect(f.locator('#status-text')).toContainText('5 rows');
  });
}

test('the schema sits behind a toggle and cannot be edited', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await open(page, [{ src: embedSrc(), width: 400, height: 500 }]);
  const f = await ready(page);
  const toggle = f.locator('#embed-schema-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(f.locator('#schema-panel')).toBeVisible();
  await expect(f.locator('#schema-editor .cm-content')).toContainText('CREATE TEMPORARY TABLE orders');
  await expect(f.locator('#schema-editor .cm-content')).toHaveAttribute('aria-readonly', 'true');
  await f.locator('#schema-editor .cm-content').click();
  await page.keyboard.type('DROP');
  await expect(f.locator('#schema-editor .cm-content')).not.toContainText('DROP');
  await toggle.click();
  await expect(f.locator('#schema-panel')).toBeHidden();
});

test('five embeds open no session and make no API call until one is run', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, Array.from({ length: 5 }, () => ({ src: embedSrc(), width: 400, height: 300 })));
  for (let i = 0; i < 5; i++) await ready(page, i);
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);

  await frameOf(page, 2).locator('#run-query-btn').click();
  await expect(frameOf(page, 2).locator('.rv-table tbody tr')).toHaveCount(5);
  expect(calls.filter((c) => c === 'POST /api/sessions')).toHaveLength(1);
  // The session first, then the schema, then the query.
  const order = ['POST /api/sessions', 'POST /api/sessions/test-session/execute', 'POST /api/sessions/test-session/execute/stream'].map((c) => calls.indexOf(c));
  expect(order[0]).toBe(0);
  expect(order[1]).toBeGreaterThan(order[0]);
  expect(order[2]).toBeGreaterThan(order[1]);
  expect(calls.some((c) => c.includes('build-info') || c.includes('/api/fiddles'))).toBe(false);
});

test('the first Run builds the schema once; a second Run only runs the query', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [{ src: embedSrc(), width: 600, height: 500 }]);
  const f = await ready(page);
  const statements = [];
  page.on('request', (r) => { if (/\/execute(\/stream)?$/.test(r.url())) statements.push(JSON.parse(r.postData()).sql.split('\n')[0]); });
  await f.locator('#run-query-btn').click();
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
  await expect(f.locator('#run-query-btn .run-label')).toHaveText('Run Query');
  await f.locator('#run-query-btn').click();
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
  await page.waitForTimeout(800); // longer than the full app's 500 ms build-after-load timer
  expect(statements.length).toBe(3);
  expect(statements).toEqual(['CREATE TEMPORARY TABLE orders (', 'SELECT user_id, amount FROM orders', 'SELECT user_id, amount FROM orders']);
  expect(calls.filter((c) => c === 'POST /api/sessions')).toHaveLength(1);
});

test('a double click on Run opens one session and runs once', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [{ src: embedSrc(), width: 600, height: 500 }]);
  await page.route('**/api/sessions', async (route) => { await new Promise((r) => setTimeout(r, 600)); await route.fallback(); });
  const f = await ready(page);
  const run = f.locator('#run-query-btn');
  await run.click();
  await expect(f.locator('#results-container')).toContainText('Waking up the Flink cluster');
  await run.click({ force: true }).catch(() => {});
  await f.locator('body').press('Control+Enter').catch(() => {});
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
  expect(calls.filter((c) => c === 'POST /api/sessions')).toHaveLength(1);
  expect(calls.filter((c) => c.endsWith('/execute/stream'))).toHaveLength(1);
});

test('cold start: a sleeping backend answers 503, the embed says so and keeps trying', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [{ src: embedSrc(), width: 600, height: 500 }]);
  let attempts = 0;
  await page.route('**/api/sessions', async (route) => {
    if (route.request().method() === 'POST' && ++attempts <= 2) return route.fulfill({ status: 503, body: 'upstream starting' });
    return route.fallback();
  });
  const f = await ready(page);
  await f.locator('#run-query-btn').click();
  await expect(f.locator('#results-container')).toContainText('Waking up the Flink cluster…');
  await expect(f.locator('#status-text')).toHaveText('Waking up the Flink cluster…');
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
  expect(attempts).toBe(3);
  expect(calls.filter((c) => c === 'POST /api/sessions')).toHaveLength(3);
});

test('a backend that never wakes gives up with a message, and Run tries again', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await open(page, [{ src: embedSrc(), width: 600, height: 500 }]);
  let attempts = 0;
  await page.route('**/api/sessions', (route) => { attempts++; return route.fulfill({ status: 502, body: 'bad gateway' }); });
  const f = await ready(page);
  await f.locator('#run-query-btn').click();
  await expect(f.locator('#status-text')).toHaveText('The Flink cluster did not wake up. Press Run to try again.', { timeout: 15000 });
  expect(attempts).toBe(8);
  await expect(f.locator('#run-query-btn')).toBeEnabled();
});

test('a session that expired is replaced on the next Run', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [{ src: embedSrc(), width: 600, height: 500 }]);
  let sessions = 0;
  await page.route('**/api/sessions', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ sessionId: `s${++sessions}` }) }) : route.fallback()));
  let expired = false;
  await page.route('**/api/sessions/s1/execute/stream', (route) => {
    if (!expired) { expired = true; return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Session not found', code: 'SESSION_NOT_FOUND' }) }); }
    return route.fallback();
  });
  const f = await ready(page);
  await f.locator('#run-query-btn').click();
  await expect(f.locator('#results-container')).toContainText('The session expired. Press Run to start a new one.');
  await f.locator('#run-query-btn').click();
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
  expect(sessions).toBe(2);
  expect(calls.filter((c) => c === 'POST /api/sessions/s2/execute')).toHaveLength(1); // the schema, rebuilt in the new session
});

test('autorun runs once the embed is on screen, not before', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [
    { src: embedSrc('?autorun=1'), width: 400, height: 300 },
    { src: embedSrc('?autorun=1'), width: 400, height: 300, top: 2500 },
  ]);
  await ready(page, 0);
  await expect(frameOf(page, 0).locator('.rv-table tbody tr')).toHaveCount(5);
  await page.waitForTimeout(500);
  expect(calls.filter((c) => c === 'POST /api/sessions')).toHaveLength(1); // the second frame is below the fold
  await page.evaluate(() => document.getElementById('e1').scrollIntoView());
  await expect(frameOf(page, 1).locator('.rv-table tbody tr')).toHaveCount(5);
  expect(calls.filter((c) => c === 'POST /api/sessions')).toHaveLength(2);
  expect(calls.filter((c) => c.endsWith('/execute/stream'))).toHaveLength(2); // once each
});

test('without autorun nothing runs, and autorun=true is not autorun=1', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [{ src: embedSrc('?autorun=true'), width: 400, height: 300 }]);
  await ready(page);
  await page.waitForTimeout(600);
  expect(calls).toEqual([]);
});

test('the tab param picks the results tab; unknown values fall back to the table', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await open(page, [
    { src: embedSrc('?tab=changelog'), width: 500, height: 400 },
    { src: embedSrc('?tab=graph'), width: 500, height: 400 },
    { src: embedSrc('?tab=%3Cimg%20src%3Dx%20onerror%3Dwindow.pwned%3D1%3E'), width: 500, height: 400 },
  ]);
  for (let i = 0; i < 3; i++) await ready(page, i);
  await expect(frameOf(page, 0).locator('.rtab.is-active')).toHaveAttribute('data-tab', 'changelog');
  await expect(frameOf(page, 1).locator('.rtab.is-active')).toHaveAttribute('data-tab', 'graph');
  await expect(frameOf(page, 2).locator('.rtab.is-active')).toHaveAttribute('data-tab', 'table');
  for (const frame of page.frames().filter((x) => x.url().includes('embed.html'))) {
    expect(await frame.evaluate(() => window.pwned)).toBeUndefined();
    expect(await frame.locator('img').count()).toBe(0);
  }
  await frameOf(page, 0).locator('#run-query-btn').click();
  await expect(frameOf(page, 0).locator('.rv-log-row, .rv-cl-row, #results-container tr, #results-container .rv-row').first()).toBeVisible();
});

test('Open in playground carries the fragment, and the query as edited', async ({ page, context, isMobile }) => {
  test.skip(isMobile);
  await open(page, [{ src: embedSrc(), width: 600, height: 500 }]);
  const f = await ready(page);
  const link = f.locator('#embed-open');
  await expect(link).toHaveAttribute('href', `${APP}/#${fragment}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  await f.locator('#query-editor .cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' LIMIT 3');
  await expect.poll(async () => (await link.getAttribute('href')).split('#')[1]).not.toBe(fragment);
  const edited = await FiddleLink.decode((await link.getAttribute('href')).split('#')[1]);
  expect(edited).toEqual({ ...FIDDLE, query: `${FIDDLE.query} LIMIT 3` });
});

test('a damaged or hostile link says so, loads the default fiddle and never runs', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const bomb = 'f=v1.' + zlib.deflateRawSync(Buffer.alloc(64 * 1024 * 1024)).toString('base64url');
  expect(bomb.length).toBeLessThan(200000);
  const calls = await open(page, [
    { src: embedSrc('?autorun=1', 'f=v1.not-a-fiddle'), width: 500, height: 400 },
    { src: embedSrc('?autorun=1', bomb), width: 500, height: 400 },
    { src: embedSrc('?autorun=1', 'f=v2.future'), width: 500, height: 400 },
  ]);
  for (let i = 0; i < 3; i++) {
    const f = await ready(page, i);
    await expect(f.locator('#status-text')).toHaveText('This fiddle link is damaged or from a newer version');
  }
  await page.waitForTimeout(600);
  expect(calls).toEqual([]);
});

test('an embed with no fiddle in the link shows the first preset', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await open(page, [{ src: `${APP}/embed.html`, width: 500, height: 400 }]);
  const f = await ready(page);
  const first = await f.locator('body').evaluate(() => EXAMPLES[0].query.trim().split('\n')[0]);
  await expect(f.locator('#query-editor .cm-content')).toContainText(first);
  await expect(f.locator('#embed-open')).toHaveAttribute('href', `${APP}/`);
});

test('the Share menu offers Copy link and Copy embed code', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied.push(t); } }, configurable: true });
  });
  await stubApi(page);
  await page.goto(`${APP}/#${fragment}`);
  await expect(page.locator('.cm-editor')).toHaveCount(2);
  await expect(page.locator('#query-editor .cm-content')).toContainText('SELECT user_id, amount FROM orders');
  const share = page.locator('#share-btn');
  await expect(share).toHaveAttribute('aria-haspopup', 'menu');
  await share.click();
  const menu = page.locator('#share-menu');
  await expect(menu.getByRole('menuitem')).toHaveText(['Copy link', 'Copy embed code']);
  await expect(share).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(share).toBeFocused();

  await share.click();
  await menu.getByRole('menuitem', { name: 'Copy embed code' }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__copied.length)).toBe(1);
  const [snippet] = await page.evaluate(() => window.__copied);
  expect(snippet).toMatch(/^<iframe src="http:\/\/127\.0\.0\.1:\d+\/embed\.html#f=v1\.[\w-]+" /);
  expect(snippet).toContain('loading="lazy"');
  expect(snippet).toContain('width="100%" height="480"');
  const src = /src="([^"]+)"/.exec(snippet)[1];
  expect(await FiddleLink.decode(new URL(src).hash)).toEqual(FIDDLE);

  await share.click();
  await menu.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect.poll(() => page.evaluate(() => window.__copied.length)).toBe(2);
  expect((await page.evaluate(() => window.__copied))[1]).toMatch(/\/f\/abc123$/);
  // Clicking away closes the menu.
  await share.click();
  await page.locator('#query-editor').click();
  await expect(menu).toHaveCount(0);
});

for (const theme of ['nebula', 'carbon', 'cobalt']) {
  test(`${theme} theme: embed text keeps 4.5:1 contrast`, async ({ page, isMobile }) => {
    test.skip(isMobile);
    await open(page, [{ src: embedSrc(`?theme=${theme}`), width: 700, height: 500 }]);
    const f = await ready(page);
    await expect(f.locator('html')).toHaveAttribute('data-theme', theme);
    await f.locator('#run-query-btn').click();
    await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
    const frame = page.frames().find((x) => x.url().includes('embed.html'));
    await frame.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))));
    const results = await frame.evaluate((fn) => new Function(`return (${fn})`)()(
      // The Run button is white on a gradient, which measureContrast cannot see; it is the app's own button.
      ['#embed-schema-toggle', '#embed-open', '#status-mode', '#status-text', '.rtab.is-active', '.rtab:not(.is-active)',
        '.rv-table thead th', '.rv-table tbody td']
        .map((sel) => ({ what: sel, el: document.querySelector(sel) }))), measureContrast.toString());
    expect(results.filter((m) => m.ratio < 4.5), `${theme}: text below 4.5:1`).toEqual([]);
  });
}

test('the waking and failure states keep 4.5:1 contrast in every theme', async ({ page, isMobile }) => {
  test.skip(isMobile);
  for (const theme of ['nebula', 'carbon', 'cobalt']) {
    await page.unrouteAll();
    await open(page, [{ src: embedSrc(`?theme=${theme}`), width: 700, height: 500 }]);
    await page.route('**/api/sessions', () => {}); // never answers: stays in the waking state
    const f = await ready(page);
    await f.locator('#run-query-btn').click();
    await expect(f.locator('#results-container')).toContainText('Waking up the Flink cluster');
    const frame = page.frames().find((x) => x.url().includes('embed.html'));
    await frame.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))));
    const results = await frame.evaluate((fn) => new Function(`return (${fn})`)()(
      ['.rv-empty-label', '.rv-empty-hint', '#status-text'].map((sel) => ({ what: sel, el: document.querySelector(sel) }))), measureContrast.toString());
    expect(results.filter((m) => m.ratio < 4.5), `${theme}: text below 4.5:1`).toEqual([]);
  }
});

test('phone: the embed fits a 390 px window and its controls are 44 px targets', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone projects only');
  await open(page, [{ src: embedSrc(), width: 390, height: 520 }]);
  const f = await ready(page);
  const targets = await f.locator('body').evaluate(() => ['#run-query-btn', '#embed-schema-toggle', '#embed-open', ...[...document.querySelectorAll('.rtab')].map((_, i) => `.rtab:nth-child(${i + 1})`)]
    .map((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { sel, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; }));
  for (const t of targets) { expect(t.h, `${t.sel} height`).toBeGreaterThanOrEqual(44); expect(t.w, `${t.sel} width`).toBeGreaterThanOrEqual(44); }
  expect(await f.locator('body').evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect((await f.locator('#embed-open').boundingBox()).x + (await f.locator('#embed-open').boundingBox()).width).toBeLessThanOrEqual(390);
  await f.locator('#run-query-btn').click();
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5);
  // Phone behaviour of the app (a single panel at a time) must not leak into the embed.
  await expect(f.locator('#query-editor .cm-content')).toBeVisible();
  await expect(f.locator('#results-container')).toBeVisible();
});

test('the embed page runs without console errors', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource|Viewport argument key "interactive-widget"/.test(m.text())) errors.push(m.text()); });
  await open(page, [{ src: embedSrc('?autorun=1&tab=changelog'), width: 500, height: 400 }]);
  const f = await ready(page);
  await expect(f.locator('.rtab.is-active')).toHaveAttribute('data-tab', 'changelog');
  await f.locator('#embed-schema-toggle').click();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});

test('autorun does not run in a frame too small to read', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const calls = await open(page, [{ src: embedSrc('?autorun=1'), width: 1, height: 1 }]);
  await ready(page, 0);
  await page.waitForTimeout(1200);
  expect(calls).toEqual([]);
});

test('autorun does not run in a transparent frame (IntersectionObserver v2)', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'only Chromium reports whether a frame is really visible; elsewhere autorun is best effort');
  const calls = await open(page, [{ src: embedSrc('?autorun=1'), width: 400, height: 300, style: 'opacity:0' }]);
  await ready(page, 0);
  await page.waitForTimeout(1200);
  expect(calls).toEqual([]);
});

test('a link changed after load voids a pending autorun and brings its own schema and link', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const other = await FiddleLink.encode({ schema: '', query: 'SELECT 1', mode: 'BATCH' });
  const calls = await open(page, [{ src: embedSrc('?autorun=1'), width: 400, height: 300, top: 2500 }]);
  await ready(page);
  // Off screen: autorun is pending. Point the frame at a damaged link, then scroll it into view.
  await page.evaluate(() => { const f = document.getElementById('e0'); f.src = f.src.split('#')[0] + '#f=v1.broken'; });
  await expect(frameOf(page).locator('#status-text')).toHaveText('This fiddle link is damaged or from a newer version');
  await page.evaluate(() => document.getElementById('e0').scrollIntoView());
  await page.waitForTimeout(1200);
  expect(calls).toEqual([]);

  // A valid new link: Run uses its (empty) schema in a fresh session, and Open in playground follows it.
  await page.evaluate((frag) => { const f = document.getElementById('e0'); f.src = f.src.split('#')[0] + '#' + frag; }, other);
  await expect(frameOf(page).locator('#embed-open')).toHaveAttribute('href', `${APP}/#${other}`);
  await expect(frameOf(page).locator('#query-editor .cm-content')).toContainText('SELECT 1');
  await frameOf(page).locator('#run-query-btn').click();
  await expect(frameOf(page).locator('#status-text')).toContainText('row');
  const executes = calls.filter((c) => /\/execute(\/stream)?$/.test(c));
  expect(executes).toHaveLength(1); // no CREATE: the new fiddle has no schema
});

test('a fiddle with an empty schema runs without a schema build', async ({ page, isMobile }) => {
  test.skip(isMobile);
  const frag = await FiddleLink.encode({ schema: '', query: 'SELECT 1', mode: 'BATCH' });
  const calls = await open(page, [{ src: embedSrc('', frag), width: 400, height: 300 }]);
  const f = await ready(page);
  await f.locator('#run-query-btn').click();
  await expect(f.locator('#status-text')).toContainText('row');
  expect(calls.filter((c) => c.endsWith('/execute'))).toHaveLength(1);
});

test('a session request that hangs times out, retries, and leaves Run usable', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'WebKit under Playwright does not abort a request its route is holding');
  await open(page, [{ src: embedSrc(), width: 500, height: 400 }]);
  let attempts = 0;
  await page.route('**/api/sessions', (route) => { if (route.request().method() === 'POST' && ++attempts === 1) return; return route.fallback(); });
  const f = await ready(page);
  await f.locator('#run-query-btn').click();
  await expect(f.locator('.rv-table tbody tr')).toHaveCount(5, { timeout: 25000 });
  expect(attempts).toBe(2);
  await expect(f.locator('#run-query-btn')).toBeEnabled();
});

test('Tab leaves the Share menu from the Share button', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await stubApi(page);
  await page.goto(`${APP}/`);
  await expect(page.locator('.cm-editor')).toHaveCount(2);
  await page.locator('#share-btn').click();
  await page.keyboard.press('Tab');
  await expect(page.locator('#share-menu')).toHaveCount(0);
  const focused = await page.evaluate(() => document.activeElement.id);
  expect(focused).not.toBe('tour-btn'); // before: focus fell back to the start of the page
});
