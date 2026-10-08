'use strict';
// One phone criterion (PHONE_QUERY in js/app.js, mirrored by the phone @media block in
// css/style.css) decides the layout. Short touch screens get the phone layout; tablets keep the
// desktop layout, and mouse-driven windows keep main's layout at any height (a narrow one gets
// the phone layout, as on main). Runs in Chromium and WebKit.
const { test, expect } = require('@playwright/test');
const { openApp, fontsReady, layoutState, layoutOf, controlsOutsideWindow, PHONE, DESKTOP } = require('./layout');

const CASES = [
  { name: 'iPhone 13 landscape', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'Pixel 7 landscape', use: { viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'iPhone 13 portrait', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'iPhone SE landscape', use: { viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true }, want: PHONE },
  // An upright phone with the on-screen keyboard open: interactive-widget=resizes-content shrinks
  // the viewport, so it is short but still taller than wide.
  { name: 'upright phone, keyboard open', use: { viewport: { width: 412, height: 450 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'upright phone, tall keyboard', use: { viewport: { width: 412, height: 400 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'small mouse window', use: { viewport: { width: 440, height: 400 }, isMobile: false, hasTouch: false }, want: PHONE },
  { name: 'short mouse window', use: { viewport: { width: 700, height: 480 }, isMobile: false, hasTouch: false }, want: PHONE },
  { name: 'short desktop window, mouse', use: { viewport: { width: 1280, height: 480 }, isMobile: false, hasTouch: false }, want: DESKTOP },
  { name: 'very short desktop window, mouse', use: { viewport: { width: 1024, height: 360 }, isMobile: false, hasTouch: false }, want: DESKTOP },
  { name: 'desktop window, mouse', use: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }, want: DESKTOP },
  { name: 'iPad landscape', use: { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true }, want: DESKTOP },
  { name: 'iPad portrait', use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }, want: DESKTOP },
];

for (const c of CASES) {
  test.describe(c.name, () => {
    test.use(c.use);

    test(`gets the ${c.want === PHONE ? 'phone' : 'desktop'} layout`, async ({ page }) => {
      await openApp(page);
      expect(layoutOf(await layoutState(page))).toEqual(c.want);
    });

    test('the stylesheet and the app use the same phone criterion', async ({ page }) => {
      await openApp(page);
      const s = await layoutState(page);
      expect(s.cssQuery, 'the phone @media block').not.toBeNull();
      expect(s.cssQuery).toBe(s.jsQuery);
      // And they agree on this screen: the app thinks phone exactly when the CSS shows phone controls.
      expect(s.jsPhone).toBe(s.tabs);
    });
  });
}

// Screens that get the phone layout but must keep main's stacked arrangement, with the tabs in
// their own row below the topbar: the sideways compaction is only for phones held sideways.
const STACKED = [
  // An upright phone with the on-screen keyboard open: interactive-widget=resizes-content
  // shrinks the viewport, so it is short but still taller than wide.
  { name: 'upright phone, keyboard open', use: { viewport: { width: 412, height: 450 }, isMobile: true, hasTouch: true } },
  // An upright phone whose keyboard leaves a viewport shorter than it is wide.
  { name: 'upright phone, tall keyboard', use: { viewport: { width: 412, height: 400 }, isMobile: true, hasTouch: true } },
  // Small mouse-driven windows wider than tall: criterion 2 keeps main's layout for them.
  { name: 'small mouse window', use: { viewport: { width: 440, height: 400 }, isMobile: false, hasTouch: false } },
  { name: 'short mouse window', use: { viewport: { width: 700, height: 480 }, isMobile: false, hasTouch: false } },
];

// .app clips its overflow, so a control pushed past the window edge never makes the page
// scroll; these check each control's box against the window instead.
for (const c of STACKED) {
  test.describe(c.name, () => {
    test.use(c.use);

    test('keeps the stacked phone layout: full-width tabs below the topbar', async ({ page }) => {
      await openApp(page);
      await fontsReady(page);
      const g = await page.evaluate(() => ({
        topbarBottom: document.querySelector('.topbar').getBoundingClientRect().bottom,
        innerWidth: window.innerWidth,
        tabs: [...document.querySelectorAll('.m-views [role="tab"]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { tab: el.id, top: r.top, left: r.left, right: r.right, width: r.width };
        }),
      }));
      for (const t of g.tabs) {
        expect(t.top, `${t.tab} sits below the topbar`).toBeGreaterThanOrEqual(g.topbarBottom - 1);
        expect(t.width, `${t.tab} width`).toBeGreaterThanOrEqual(44);
        expect(t.left, `${t.tab} left edge`).toBeGreaterThanOrEqual(0);
        expect(t.right, `${t.tab} right edge`).toBeLessThanOrEqual(g.innerWidth);
      }
      expect(await controlsOutsideWindow(page)).toEqual([]);
    });
  });
}

// Phones held sideways, from the narrowest named one up: each gets the compaction, with the
// panel tabs in the topbar's row. This pins the 560px floor of the compaction below them.
const SIDEWAYS = [[667, 375], [740, 360], [780, 360], [844, 390], [915, 412]];
for (const [width, height] of SIDEWAYS) {
  test.describe(`phone held sideways ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    test('shares the topbar row with the panel tabs', async ({ page }) => {
      await openApp(page);
      await fontsReady(page);
      const rowGap = await page.evaluate(() => {
        const centre = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top + r.height / 2; };
        return Math.abs(centre('.m-views') - centre('.topbar'));
      });
      expect(rowGap).toBeLessThan(2);
      expect(await controlsOutsideWindow(page)).toEqual([]);
    });
  });
}

test.describe('iPhone SE landscape', () => {
  test.use({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true });

  test('every tab and toolbar control is inside the window, 44px and unclipped', async ({ page }) => {
    await openApp(page);
    expect(await controlsOutsideWindow(page)).toEqual([]);
    const small = await page.evaluate(() => [...document.querySelectorAll('.m-views [role="tab"], .topbar button, .toolbar button, .toolbar select')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
      .map((el) => el.id || el.textContent.trim()));
    expect(small, 'controls under 44px').toEqual([]);
  });
});
