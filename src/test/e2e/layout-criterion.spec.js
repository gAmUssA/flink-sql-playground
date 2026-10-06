'use strict';
// One phone criterion (PHONE_QUERY in js/app.js, mirrored by the phone @media block in
// css/style.css) decides the layout. Short touch screens get the phone layout; mouse-driven
// windows of any height and tablets keep the desktop layout. Runs in Chromium and WebKit.
const { test, expect } = require('@playwright/test');
const { openApp, layoutState, layoutOf, PHONE, DESKTOP } = require('./layout');

const CASES = [
  { name: 'iPhone 13 landscape', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'Pixel 7 landscape', use: { viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true }, want: PHONE },
  { name: 'iPhone 13 portrait', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, want: PHONE },
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
