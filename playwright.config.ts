// Browser e2e (npm run e2e): the production build served by `vite preview`, driven in Chromium, WebKit and Firefox.
// Not part of `npm test`. Port 4817 is neither the dev server (5180) nor the family's preview (5181), so the owner's servers stay alone.
import { defineConfig, devices } from '@playwright/test'

const PORT = 4817

export default defineConfig({
  testDir: 'e2e',
  // DuckDB-WASM starts in every test and the build walk is long: one worker, a generous timeout, no retries (a flaky pass hides a bug).
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: [['list']],
  use: { actionTimeout: 30_000, baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  // The production build matters: the DuckDB worker paths break only in it.
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
})
