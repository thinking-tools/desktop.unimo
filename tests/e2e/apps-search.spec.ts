// tests/e2e/apps-search.spec.ts
import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test';
import { platform } from 'os';

// Search round-trip budget (type → results visible): generous enough for CI
const SEARCH_RESPONSE_MS = 300;

// Linux needs --no-sandbox unless chrome-sandbox has SUID bit set
const electronArgs = platform() === 'linux' ? ['.', '--no-sandbox'] : ['.'];

// Candidate system apps per platform – CI runners may not have all of these,
// so the test discovers which are actually indexed before asserting.
const SYSTEM_APP_CANDIDATES: Record<string, string[]> = {
  darwin: ['Terminal', 'Calculator', 'Safari', 'TextEdit', 'Preview'],
  win32: ['Microsoft Edge', 'PowerShell', 'Git', 'Python', 'Visual Studio'],
  linux: ['Firefox', 'Vim', 'Files', 'Snap Store', 'Text Editor'],
};
const MIN_EXPECTED_APPS = 1;

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

    // Warm up: run each query once (untimed) so caches and IPC are hot
    // Queries chosen to always match built-in commands regardless of installed apps
    const queries = ['s', 'set', 're', 'dev'];
    for (const q of queries) {
      await input.fill(q);
      await expect(results.first()).toBeVisible({ timeout: 500 });
      await input.fill('');
    }

    // Now benchmark the same queries
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
    const candidates = SYSTEM_APP_CANDIDATES[platform()] ?? [];
    test.skip(candidates.length === 0, `No candidate apps defined for platform "${platform()}"`);

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

    // Discovery pass: find which candidates are actually indexed on this machine
    const available: string[] = [];
    for (const appName of candidates) {
      // Clear previous results to avoid matching stale DOM (debounce = 90ms)
      await input.fill('');
      await expect(results.first()).not.toBeVisible({ timeout: 1000 }).catch(() => {});
      const query = appName.slice(0, 6).toLowerCase();
      await input.fill(query);
      try {
        await expect(results.first()).toBeVisible({ timeout: 1000 });
        const titles = await results.locator('.result-title').allInnerTexts();
        if (titles.some(t => t.toLowerCase().includes(appName.toLowerCase()))) {
          available.push(appName);
        }
      } catch {
        /* app not indexed on this runner */
      }
    }

    console.log(`  Available apps: ${available.join(', ')} (${available.length}/${candidates.length})`);
    expect(
      available.length,
      `Expected at least ${MIN_EXPECTED_APPS} of [${candidates.join(', ')}]`,
    ).toBeGreaterThanOrEqual(MIN_EXPECTED_APPS);

    // Warm up discovered apps
    for (const appName of available) {
      await input.fill('');
      await expect(results.first()).not.toBeVisible({ timeout: 1000 }).catch(() => {});
      await input.fill(appName.slice(0, 3).toLowerCase());
      await expect(results.first()).toBeVisible({ timeout: 1000 });
    }

    // Now benchmark + verify discovered apps
    for (const appName of available) {
      await input.fill('');
      await expect(results.first()).not.toBeVisible({ timeout: 1000 }).catch(() => {});
      const query = appName.slice(0, 3).toLowerCase();
      const start = Date.now();
      await input.fill(query);
      await expect(results.first()).toBeVisible({ timeout: 1000 });
      const elapsed = Date.now() - start;
      console.log(`  "${appName}" via "${query}": ${elapsed}ms`);

      expect(elapsed, `Search for "${appName}" exceeded ${SEARCH_RESPONSE_MS}ms`).toBeLessThan(SEARCH_RESPONSE_MS);

      const titles = await results.locator('.result-title').allInnerTexts();
      const found = titles.some(t => t.toLowerCase().includes(appName.toLowerCase()));
      expect(found, `Expected "${appName}" in results for query "${query}". Got: ${titles.join(', ')}`).toBe(true);
    }
  });
});
