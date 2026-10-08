// Browser tests for the SPA. They serve the static files (scripts/serve-static.js) and stub
// the API (src/test/e2e/stub-api.js), so no backend is needed.
const { defineConfig, devices } = require('@playwright/test');

// E2E_PORT moves the static server off 8790, e.g. when another checkout already serves there.
const PORT = Number(process.env.E2E_PORT || 8790);
const phones = [
  { name: 'iphone13', device: devices['iPhone 13'], viewport: { width: 390, height: 844 } },
  { name: 'pixel7', device: devices['Pixel 7'], viewport: { width: 412, height: 915 } },
  { name: 'small375', device: devices['iPhone SE'], viewport: { width: 375, height: 667 } },
  // Rotated phones: wider than the 767px breakpoint, but short and touch-driven.
  { name: 'iphone13-landscape', device: devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 }, landscape: true },
  { name: 'pixel7-landscape', device: devices['Pixel 7 landscape'], viewport: { width: 915, height: 412 }, landscape: true },
];

module.exports = defineConfig({
  testDir: 'src/test/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: { command: `node scripts/serve-static.js ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: !process.env.CI },
  projects: [
    ...phones.flatMap(({ name, device, viewport, landscape }) => ['chromium', 'webkit'].map((browserName) => ({
      name: `${name}-${browserName}`,
      testMatch: landscape ? /(mobile|landscape)\.spec\.js/ : /mobile\.spec\.js/,
      use: { ...device, viewport, browserName },
    }))),
    // Which layout each kind of screen gets (phones, short desktop windows, tablets).
    ...['chromium', 'webkit'].map((browserName) => ({
      name: `layout-criterion-${browserName}`, testMatch: /layout-criterion\.spec\.js/, use: { browserName },
    })),
    { name: 'desktop-chromium', testMatch: /(desktop|editor|results-bars)\.spec\.js/, use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'desktop-webkit', testMatch: /(editor|results-bars)\.spec\.js/, use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
  ],
});
