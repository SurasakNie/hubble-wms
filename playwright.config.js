// Playwright smoke config. Serves the repo statically and drives Chromium.
// Tests should stay backend-independent (the login page is static) so CI does
// not depend on Supabase credentials.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx --yes http-server -p 4173 -c-1 .',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Local/offline runs can point at a pre-installed Chromium via
        // PW_CHROMIUM; CI leaves it unset and uses `npx playwright install`.
        launchOptions: process.env.PW_CHROMIUM
          ? { executablePath: process.env.PW_CHROMIUM }
          : {},
      },
    },
  ],
});
