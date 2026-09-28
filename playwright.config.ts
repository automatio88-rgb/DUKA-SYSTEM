import { defineConfig, devices } from '@playwright/test';
// Mobile-first: every E2E runs in a Pixel 7 viewport (this is a phone app).
export default defineConfig({
  testDir: './e2e', timeout: 60_000, retries: 1,
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build -w @duka/web && npm run preview -w @duka/web -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 180_000 },
});
