import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end tests for the embedding playground's word features, in 2D and 3D:
 * typed analogies (Feature 2.9), pasted-text import (Feature 2.8), focus, the HUD links, and the
 * "Analogies on this board" panel (Feature 5.16). Setup goes through the dev handle
 * (`window.__lexical`, dev server only); the features under test go through the real UI.
 * Every test runs in a fresh browser context, so IndexedDB starts empty.
 */

type Lexical = {
  stores: {
    menuStore: {
      engineStatus: string;
      lastPlay: { a: string; b: string; c: string; answer: string } | null;
      boardAnalogies: unknown[];
      setView(view: string): void;
    };
    gameStore: { setHintMode(on: boolean): void; setDimension(d: string): void; setLayout3d(l: string): void };
  };
  deps: { activeWorld?: { dimension: string; wordTexts(): string[] } };
  focusedWords(): string[];
};
declare global {
  interface Window { __lexical: Lexical }
}

/** Words that are all in the base vocabulary, so no test needs the live encoder (a network download). */
const COOKING = `Whisk the eggs with sugar until pale, then fold in the flour and melted butter. Pour the batter into
a greased pan and bake in a hot oven for twenty minutes. Let the cake cool before adding the frosting,
and sprinkle with cinnamon. The recipe works with brown sugar too.`;

async function openSandbox(page: Page, dimension: '2d' | '3d') {
  await page.goto('/');
  await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
  await page.evaluate(d => {
    const { gameStore, menuStore } = window.__lexical.stores;
    gameStore.setHintMode(true);
    gameStore.setLayout3d('shape');
    gameStore.setDimension(d);
    menuStore.setView('fountain');
  }, dimension);
  await page.waitForFunction(d => {
    const world = window.__lexical.deps.activeWorld;
    return world?.dimension === d && world.wordTexts().length >= 8;
  }, dimension, { timeout: 20_000 }).catch(async error => {
    const state = await page.evaluate(() => ({
      dimension: window.__lexical.deps.activeWorld?.dimension,
      words: window.__lexical.deps.activeWorld?.wordTexts().length,
      view: (window.__lexical.stores.menuStore as unknown as { view: string }).view,
    }));
    throw new Error(`Board not ready: ${JSON.stringify(state)} (${error})`);
  });
}

const wordBox = (page: Page) => page.getByRole('textbox', { name: 'Add a word' });
const boardWords = (page: Page) => page.evaluate(() => window.__lexical.deps.activeWorld!.wordTexts());
const focused = (page: Page) => page.evaluate(() => window.__lexical.focusedWords().sort());

async function expectFocused(page: Page, words: string[]) {
  await expect.poll(() => focused(page), { timeout: 5_000 }).toEqual([...words].sort());
}

for (const dimension of ['2d', '3d'] as const) {
  test.describe(`word features in ${dimension.toUpperCase()}`, () => {
    test.beforeEach(async ({ page }) => openSandbox(page, dimension));

    test('a typed analogy previews, plays, lands all four words, and focuses them', async ({ page }) => {
      await wordBox(page).fill('king - man + woman');
      await expect(page.getByTestId('expression-preview')).toContainText('queen');
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

      await wordBox(page).press('Enter');
      await expect.poll(() => page.evaluate(() => window.__lexical.stores.menuStore.lastPlay)).toMatchObject({ a: 'man', b: 'king', c: 'woman', answer: 'queen' });
      await expect.poll(async () => (await boardWords(page)).filter(w => ['king', 'man', 'woman', 'queen'].includes(w)).length).toBe(4);
      await expectFocused(page, ['king', 'man', 'woman', 'queen']);
      await expect(page.getByTestId('last-play')).toContainText('queen');
    });

    test('analogy notation and sums work; malformed input explains itself', async ({ page }) => {
      await wordBox(page).fill('ocean + desert');
      await expect(page.getByTestId('expression-preview')).toContainText('≈');
      await wordBox(page).press('Enter');
      await expect(page.getByTestId('word-message')).toContainText('ocean + desert ≈');

      await wordBox(page).fill('king + + man');
      await expect(page.locator('form')).toContainText('Two operators in a row');

      await wordBox(page).fill('man : king :: woman');
      await expect(page.getByTestId('expression-preview')).toContainText('queen');
    });

    test('a pasted text previews keywords, chips can be removed, and Drop lands and focuses them', async ({ page }) => {
      await wordBox(page).fill(COOKING);
      const chips = page.getByTestId('keyword-preview').locator('button[title*="click to remove"]');
      await expect(chips).toHaveCount(12);
      await expect(page.getByRole('button', { name: 'Drop 12' })).toBeVisible();

      const first = (await chips.first().innerText()).replace(/[×✦]/g, '').trim();
      await chips.first().click();
      await expect(chips).toHaveCount(12); // the next keyword fills in
      const chosen = (await chips.allInnerTexts()).map(t => t.replace(/[×✦]/g, '').trim());
      expect(chosen).not.toContain(first);

      await page.getByRole('button', { name: 'Drop 12' }).click();
      await expect(page.getByTestId('word-message')).toContainText('Dropped 12 words');
      await expect.poll(async () => (await boardWords(page)).filter(w => chosen.includes(w)).length, { timeout: 10_000 }).toBe(12);
      await expectFocused(page, chosen);
      await expect(wordBox(page)).toHaveValue('');
    });

    test('a single word still drops as before and takes focus', async ({ page }) => {
      await wordBox(page).fill('volcano');
      await expect(page.getByRole('button', { name: 'Drop' })).toBeVisible();
      await wordBox(page).press('Enter');
      await expect.poll(() => boardWords(page)).toContain('volcano');
      await expectFocused(page, ['volcano']);
    });

    test('HUD links and the analogies panel focus words', async ({ page }) => {
      await wordBox(page).fill('king - man + woman');
      await wordBox(page).press('Enter');
      await expect(page.getByTestId('last-play')).toContainText('queen');
      await page.waitForTimeout(3_000); // let the play's own focus expire

      await page.getByTestId('last-play').getByRole('button', { name: 'man', exact: true }).click();
      await expectFocused(page, ['man']);

      await page.locator('#analogies-toggle').click();
      const panel = page.getByTestId('board-analogies');
      await expect(panel.locator('li')).toHaveCount(1);
      await expect(panel).toContainText('man : king :: woman → queen');
      await panel.getByRole('button', { name: /man : king :: woman/ }).click();
      await expectFocused(page, ['king', 'man', 'woman', 'queen']);
      await page.waitForTimeout(3_000);
      await panel.getByTitle('Focus on "queen"').click();
      await expectFocused(page, ['queen']);
    });
  });
}

test('board analogies survive a 2D <-> 3D switch', async ({ page }) => {
  await openSandbox(page, '2d');
  await wordBox(page).fill('king - man + woman');
  await wordBox(page).press('Enter');
  await expect.poll(() => page.evaluate(() => window.__lexical.stores.menuStore.boardAnalogies.length)).toBe(1);

  await page.locator('#dimension-toggle').click();
  await page.waitForFunction(() => window.__lexical.deps.activeWorld?.dimension === '3d', null, { timeout: 20_000 });
  await page.locator('#analogies-toggle').click();
  await expect(page.getByTestId('board-analogies').locator('li')).toHaveCount(1);
  await expect.poll(() => boardWords(page), { timeout: 10_000 }).toEqual(expect.arrayContaining(['king', 'man', 'woman', 'queen']));
});
