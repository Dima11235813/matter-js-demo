import { test, expect } from '@playwright/test';

/**
 * App shell checks (Epic 4 · Task 4.5.3). These replaced screenshot-only tests that wrote to a
 * hard-coded folder outside the repo; screenshots now go to the test's own output folder.
 * Gameplay outcomes (letters, Discovery, Guess, carrying words) live in semanticPlayground.spec.ts.
 */
const ready = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (window as unknown as { __lexical?: { stores: { menuStore: { engineStatus: string } } } }).__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 45_000 });

test.describe('app shell', () => {
  test('loads: title, canvas, menu, and the vocabulary', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Word Physics Embeddings Game/);
    await expect(page.locator('#worldContainter canvas').first()).toBeVisible({ timeout: 30_000 });
    for (const id of ['#fountain-toggle', '#sandbox-toggle', '#game-toggle']) await expect(page.locator(id)).toBeVisible();
    await ready(page);
    await expect(page.getByTestId('corpus-stats')).toContainText('words');
    await page.screenshot({ path: testInfo.outputPath('desktop.png') });
  });

  test('phone viewport: no horizontal scrolling, and the mode buttons are not covered', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#worldContainter canvas').first()).toBeVisible();
    await expect(page.locator('#game-toggle')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The canvas used to cover the side menu below 768 px, and the dashboard covered the Guess button.
    const covered = await page.evaluate(() => ['#fountain-toggle', '#sandbox-toggle', '#game-toggle'].filter(id => {
      const el = document.querySelector(id)!;
      const r = el.getBoundingClientRect();
      return !el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }));
    expect(covered).toEqual([]);
    await page.locator('#game-toggle').click();
    await expect(page.getByTestId('mode-tag')).toHaveText('Guess');
    await page.screenshot({ path: testInfo.outputPath('phone.png') });
  });
});
