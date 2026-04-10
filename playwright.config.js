// @ts-check
/* eslint-env node */
import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from .env file when available (local dev).
 * In Docker, env vars are injected via docker-compose env_file.
 */
try { require('dotenv/config'); } catch {} // eslint-disable-line no-empty

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/playwright',
  /* Global setup script - runs once before all tests */
  globalSetup: './tests/global-setup.js',
  fullyParallel: false, // fixed database duplication issues in CI
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  workers: 1, // fixed database duplication issues in CI
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list', { printSteps: false }],
    ['html']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:8000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure Playwright to run only in Chromium. */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start Docker services before tests when running locally (e.g. VS Code extension).
     In CI/Docker, BASE_URL is set and the server is managed by docker-compose. */
  webServer: (!process.env.CI && !process.env.BASE_URL) ? {
    command: 'docker compose --profile web up',
    url: 'http://localhost:8000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  } : undefined,
});

