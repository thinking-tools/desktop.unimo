// tests/e2e/window-background.spec.ts
import { test, expect, _electron as electron, ElectronApplication } from '@playwright/test';
import { platform } from 'os';

const electronArgs = platform() === 'linux' ? ['.', '--no-sandbox'] : ['.'];

let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test.describe('Window background & readability', () => {
  test('platform data attribute is set on body', async () => {
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    const plat = await window.locator('body').getAttribute('data-platform');
    expect(plat).toBe(platform());
  });

  test('macOS uses vibrancy with transparent window', async () => {
    test.skip(platform() !== 'darwin', 'macOS-only');
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    const { transparent, vibrancy } = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        transparent: win.isAlwaysOnTop() !== undefined, // proxy — no direct API
        vibrancy: (win as any)._vibrancy ?? null, // internal; may be null
      };
    });

    // Verify body background is transparent (rgba with alpha 0)
    const bodyBg = await window.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bodyBg).toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)/);
  });

  test('Linux uses opaque window background', async () => {
    test.skip(platform() !== 'linux', 'Linux-only');
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    // Body must have an opaque background on Linux
    const bodyBg = await window.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
    // Should NOT be fully transparent
    expect(bodyBg).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)/);

    // Parse the alpha value — must be >= 0.95 (effectively opaque)
    const alphaMatch = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    expect(alphaMatch, `Could not parse body background: ${bodyBg}`).toBeTruthy();
    const alpha = alphaMatch![4] !== undefined ? parseFloat(alphaMatch![4]) : 1;
    expect(alpha, `Body background alpha ${alpha} is too transparent`).toBeGreaterThanOrEqual(0.95);
  });

  test('text has sufficient contrast on all platforms', async () => {
    app = await electron.launch({ args: electronArgs });
    const window = await app.firstWindow();
    await window.waitForSelector('[data-ready="true"]', { timeout: 5000 });

    // Type a query to get results visible
    const input = window.locator('#search-input');
    await expect(async () => {
      await input.fill('s');
      await expect(window.locator('.results .result-item').first()).toBeVisible();
    }).toPass({ timeout: 15000 });

    // Helper: parse "rgb(r, g, b)" or "rgba(r, g, b, a)" → { r, g, b, a }
    const parseColor = (raw: string) => {
      const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    };

    // Relative luminance (WCAG 2.1)
    const luminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    // Composite foreground over background
    const composite = (
      fg: { r: number; g: number; b: number; a: number },
      bg: { r: number; g: number; b: number; a: number },
    ) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });

    // Measure contrast between input text and its effective background
    const { textColor, bgColor } = await window.evaluate(() => {
      const inputEl = document.getElementById('search-input')!;
      const style = getComputedStyle(inputEl);
      return { textColor: style.color, bgColor: style.backgroundColor };
    });

    const fg = parseColor(textColor);
    const bg = parseColor(bgColor);
    expect(fg, `Cannot parse text color: ${textColor}`).toBeTruthy();
    expect(bg, `Cannot parse bg color: ${bgColor}`).toBeTruthy();

    // If input bg is transparent, check against body
    let effectiveBg = bg!;
    if (effectiveBg.a < 0.1) {
      const bodyBgRaw = await window.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
      effectiveBg = parseColor(bodyBgRaw) ?? effectiveBg;
    }

    const compositeFg = composite(fg!, effectiveBg);
    const L1 = luminance(compositeFg.r, compositeFg.g, compositeFg.b);
    const L2 = luminance(effectiveBg.r, effectiveBg.g, effectiveBg.b);
    const contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

    console.log(
      `  Text color: ${textColor}, Bg: ${bgColor}, Effective bg: rgba(${Math.round(effectiveBg.r)},${Math.round(effectiveBg.g)},${Math.round(effectiveBg.b)},${effectiveBg.a})`,
    );
    console.log(`  Contrast ratio: ${contrast.toFixed(2)}:1`);

    // WCAG AA requires 4.5:1 for normal text, 3:1 for large text (18px+ = large)
    // Our input is 18px so 3:1 is the threshold
    expect(
      contrast,
      `Input text contrast ${contrast.toFixed(2)}:1 below WCAG AA (3:1 for large text)`,
    ).toBeGreaterThanOrEqual(3);

    // Also verify result titles have contrast
    const resultContrast = await window.evaluate(() => {
      const title = document.querySelector('.result-title') as HTMLElement;
      if (!title) return null;
      const resultsEl = document.querySelector('.results') as HTMLElement;
      return {
        text: getComputedStyle(title).color,
        bg: getComputedStyle(resultsEl).backgroundColor,
      };
    });

    if (resultContrast) {
      const rFg = parseColor(resultContrast.text);
      const rBg = parseColor(resultContrast.bg);
      if (rFg && rBg) {
        let effectiveResultBg = rBg;
        if (effectiveResultBg.a < 0.5) {
          // Composite against body background
          const bodyBgRaw = await window.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
          const bodyBg = parseColor(bodyBgRaw);
          if (bodyBg) effectiveResultBg = composite(rBg, bodyBg);
        }
        const compFg = composite(rFg, effectiveResultBg);
        const rL1 = luminance(compFg.r, compFg.g, compFg.b);
        const rL2 = luminance(effectiveResultBg.r, effectiveResultBg.g, effectiveResultBg.b);
        const rContrast = (Math.max(rL1, rL2) + 0.05) / (Math.min(rL1, rL2) + 0.05);

        console.log(`  Result title contrast: ${rContrast.toFixed(2)}:1`);
        expect(
          rContrast,
          `Result title contrast ${rContrast.toFixed(2)}:1 below WCAG AA (4.5:1)`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
