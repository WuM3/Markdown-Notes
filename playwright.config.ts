import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT ?? 3210);
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;
const e2eDataDir = `.tmp/e2e-data/${e2ePort}`;
const cleanE2EDataCommand = `node -e "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true })" ${JSON.stringify(
  e2eDataDir,
)}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  outputDir: '.tmp/playwright',
  use: {
    baseURL: e2eBaseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${cleanE2EDataCommand} && npm run build && cross-env DATA_DIR=${e2eDataDir} HOST=127.0.0.1 PORT=${e2ePort} npm start`,
    port: e2ePort,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1194, height: 834 },
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
  ],
});
