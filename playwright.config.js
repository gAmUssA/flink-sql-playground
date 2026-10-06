// Browser tests for the SPA. They serve the static files (scripts/serve-static.js) and stub
// the API (src/test/e2e/stub-api.js), so no backend is needed.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8790;
const phones = [
  { name: 'iphone13', device: devices['iPhone 13'], viewport: { width: 390, height: 844 } },
  { name: 'pixel7', device: devices['Pixel 7'], viewport: { width: 412, height: 915 } },
  { name: 'small375', device: devices['iPhone SE'], viewport: { width: 375, height: 667 } },
];

module.exports = defineConfig({
  testDir: 'src/test/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: { command: `node scripts/serve-static.js ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: true },
  projects: [
    ...phones.flatMap(({ name, device, viewport }) => ['chromium', 'webkit'].map((browserName) => ({
      name: `${name}-${browserName}`,
      testMatch: /mobile\.spec\.js/,
      use: { ...device, viewport, browserName },
    }))),
    { name: 'desktop-chromium', testMatch: /desktop\.spec\.js/, use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
});
