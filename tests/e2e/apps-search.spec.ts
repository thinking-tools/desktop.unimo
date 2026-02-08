// tests/e2e/apps-search.spec.ts
import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test';
import { platform } from 'os';

// Search round-trip budget (type → results visible): generous enough for CI
const SEARCH_RESPONSE_MS = 300;

// Linux needs --no-sandbox unless chrome-sandbox has SUID bit set
const electronArgs = platform() === 'linux' ? ['.', '--no-sandbox'] : ['.'];

// Well-known system apps per platform that must always be findable
const SYSTEM_APPS: Record<string, string[]> = {
  darwin: ['Terminal', 'Calculator', 'Safari'],
  win32: ['Notepad', 'Calculator'],
  linux: [], // varies too much across distros – just verify search works
};

let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test.describe('App search', () => {
  test('index builds and search responds within budget', async () => {
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    const input = window.locator('#search-input');
    const results = window.locator('.results .result-item');

    // Poll until the app index is ready (buildIndex runs async after startup)
    await expect(async () => {
      await input.fill('a');
      await expect(results.first()).toBeVisible();
    }).toPass({ timeout: 15000 });

    // Now benchmark a few queries
    const queries = ['a', 'te', 'cal', 'set'];
    for (const q of queries) {
      await input.fill('');
      const start = Date.now();
      await input.fill(q);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      const elapsed = Date.now() - start;
      console.log(`  search "${q}": ${elapsed}ms`);
      expect(elapsed, `Search "${q}" exceeded ${SEARCH_RESPONSE_MS}ms`).toBeLessThan(SEARCH_RESPONSE_MS);
    }
  });

  test('system apps are visible in search results', async () => {
    const expectedApps = SYSTEM_APPS[platform()] ?? [];
    // Skip if no known system apps for this platform (e.g. Linux CI)
    test.skip(expectedApps.length === 0, `No known system apps defined for platform "${platform()}"`);

    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    const input = window.locator('#search-input');
    const results = window.locator('.results .result-item');

    // Wait for index
    await expect(async () => {
      await input.fill('a');
      await expect(results.first()).toBeVisible();
    }).toPass({ timeout: 15000 });

    for (const appName of expectedApps) {
      // Use first 3 chars as query – short enough to still get fuzzy matches
      const query = appName.slice(0, 3).toLowerCase();
      await input.fill('');
      const start = Date.now();
      await input.fill(query);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      const elapsed = Date.now() - start;
      console.log(`  "${appName}" via "${query}": ${elapsed}ms`);

      expect(elapsed, `Search for "${appName}" exceeded ${SEARCH_RESPONSE_MS}ms`).toBeLessThan(SEARCH_RESPONSE_MS);

      const titles = await results.locator('.result-title').allInnerTexts();
      const found = titles.some(t => t.toLowerCase().includes(appName.toLowerCase()));
      expect(found, `Expected "${appName}" in results for query "${query}". Got: ${titles.join(', ')}`).toBe(true);
    }
  });
});
