import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config.js';
import vitestConfig from '../../vitest.config.js';

describe('Playwright test artifacts', () => {
  it('keeps generated data and results under the ignored .tmp directory', async () => {
    expect(playwrightConfig.outputDir).toBe('.tmp/playwright');

    const webServer = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer[0]
      : playwrightConfig.webServer;
    expect(webServer?.command).toContain('.tmp/e2e-data/');
    expect(vitestConfig.test?.coverage?.reportsDirectory).toBe('.tmp/coverage');

    const gitignore = await readFile('.gitignore', 'utf8');
    expect(gitignore).toContain('.tmp/');
  });
});
