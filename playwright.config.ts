import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 390, height: 844 },
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_BUNDLED_CHROMIUM
        ? {}
        : { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' }),
      args: ['--no-sandbox'],
    },
  },
  webServer: [
    {
      command: 'npm run demo',
      url: 'http://127.0.0.1:5173/game.html',
      reuseExistingServer: true,
    },
    {
      command: 'node scripts/serve-build.mjs',
      url: 'http://127.0.0.1:5175/game.html',
      reuseExistingServer: true,
    },
  ],
  reporter: 'list',
});
