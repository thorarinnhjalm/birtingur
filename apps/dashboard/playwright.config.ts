/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Vitest suites (*.test.ts) share this directory — only *.spec.ts files
  // are Playwright's; without this filter Playwright collects the vitest
  // files and crashes on their vitest-global imports.
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // NOTE: reuseExistingServer means a manually-started dev server (which
      // lacks these env flags) will be reused and the auth-emulator tests
      // will fail against production auth — stop it before running e2e.
      command: 'npx pnpm --filter @ada/dashboard dev',
      cwd: '../../',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        VITE_AUTH_EMULATOR: '1',
        VITE_FIREBASE_PROJECT_ID: 'birtingur-8b5a4',
      },
    },
    {
      command: 'npx pnpm --filter @ada/api dev',
      cwd: '../../',
      url: 'http://localhost:3001/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
