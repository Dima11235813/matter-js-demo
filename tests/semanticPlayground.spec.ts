import { test, expect, Page } from '@playwright/test';
import { deltaE } from '../src/theme/semanticColors';

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
/** Words on the live board; empty while one world is replaced by the next (a view switch). */
const boardWords = (page: Page) => page.evaluate(() => window.__lexical.deps.activeWorld?.wordTexts() ?? []);
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
      // Sandbox: a learning hint, no timed-round verdict.
      await expect(page.getByTestId('play-verdict')).toHaveText('✓ the relation man → king carried over');
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

test('color hint mode: related words get close colors, unrelated words distant ones; off restores them (2D)', async ({ page }) => {
  await openSandbox(page, '2d');
  for (const word of ['dog', 'puppy', 'kitten', 'guitar', 'piano']) {
    await wordBox(page).fill(word);
    await wordBox(page).press('Enter');
    await expect.poll(() => boardWords(page)).toContain(word);
  }
  type Painted = Record<string, { shown: string; own: string }>;
  const colors = () => page.evaluate(() => {
    const world = window.__lexical.deps.activeWorld as unknown as { shapesFac: { boxes: { text: string; color: string; baseColor?: string; embedding?: unknown }[] } };
    return Object.fromEntries(world.shapesFac.boxes.filter(b => b.embedding).map(b => [b.text, { shown: b.color, own: b.baseColor ?? b.color }]));
  }) as Promise<Painted>;
  const before = await colors();

  await page.locator('#color-hint-toggle').click();
  await expect.poll(async () => (await colors()).dog.shown !== before.dog.shown, { timeout: 5_000 }).toBe(true);
  const painted = await colors();
  const close = deltaE(painted.dog.shown, painted.puppy.shown);
  const far = deltaE(painted.dog.shown, painted.piano.shown);
  expect(close).toBeLessThan(far);
  expect(deltaE(painted.guitar.shown, painted.piano.shown)).toBeLessThan(far);

  await page.locator('#color-hint-toggle').click();
  await expect.poll(async () => (await colors()).dog.shown, { timeout: 5_000 }).toBe(before.dog.shown);
  expect((await colors()).piano.shown).toBe(before.piano.shown);
});

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

test('Guess mode: four picks are graded against the dealt pairs; nothing spawns (2D clicks)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
  await page.evaluate(() => { window.__lexical.stores.gameStore.setHintMode(true); window.__lexical.stores.gameStore.setDimension('2d'); });
  await page.locator('#game-toggle').click();
  await expect(page.getByTestId('round-relation')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('mode-tag')).toHaveText('Guess');
  await page.waitForFunction(() => (window.__lexical.deps.activeWorld?.wordTexts().length ?? 0) >= 10, null, { timeout: 20_000 });

  type Pair = { x: string; y: string; category: string };
  type GuessStores = {
    gameStore: { relationDeal: { pairs: Pair[]; words: string[] }; game: { analogies: number; score: number } };
    menuStore: { selectedWordTexts: string[]; lastPlay: Record<string, unknown> | null };
  };
  const state = () => page.evaluate(() => {
    const { gameStore, menuStore } = window.__lexical.stores as unknown as GuessStores;
    return { pairs: gameStore.relationDeal.pairs, dealt: gameStore.relationDeal.words, analogies: gameStore.game.analogies, score: gameStore.game.score, selected: [...menuStore.selectedWordTexts] };
  });
  const canvas = (await page.locator('#worldContainter canvas').first().boundingBox())!;
  /** Clicks a board word until the click lands (labels move while physics settles). */
  const pick = async (word: string) => {
    const before = await state();
    await expect.poll(async () => {
      const probe = (await page.evaluate(() => (window.__lexical as unknown as { wordBoxes(): { text: string; x: number; y: number }[] }).wordBoxes()))
        .find(w => w.text === word)!;
      await page.mouse.move(canvas.x + probe.x, canvas.y + probe.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(250);
      const now = await state();
      return now.selected.includes(word) || now.analogies > before.analogies;
    }, { timeout: 10_000 }).toBe(true);
  };

  // Words already on the board: the dealt pairs plus the Discovery board carried into the round.
  await page.waitForTimeout(1_000);
  const boardBefore = await boardWords(page);
  // A correct quad: two dealt pairs of the round's relation, same direction, whose words are not
  // under the dashboard (clicks there reach the dashboard, not the canvas).
  const { pairs } = await state();
  const related = pairs.filter(pair => pair.category === pairs[0].category);
  const onCanvas = (words: string[]) => page.evaluate(([words, left, top]) => {
    const boxes = (window.__lexical as unknown as { wordBoxes(): { text: string; x: number; y: number }[] }).wordBoxes();
    return words.every(word => {
      const box = boxes.find(b => b.text === word);
      return !!box && document.elementFromPoint(left + box.x, top + box.y)?.tagName === 'CANVAS';
    });
  }, [words, canvas.x, canvas.y] as const);
  let quad: [Pair, Pair] | undefined;
  await expect.poll(async () => {
    for (const p of related) for (const q of related) {
      if (p !== q && await onCanvas([p.x, p.y, q.x, q.y])) { quad = [p, q]; return true; }
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
  const [p, q] = quad!;
  // A wrong quad (the second pair reversed) earns nothing, and its words stay.
  for (const word of [p.x, p.y, q.y, q.x]) await pick(word);
  await expect.poll(() => page.evaluate(() => window.__lexical.stores.menuStore.lastPlay)).toMatchObject({ a: p.x, b: p.y, c: q.y, answer: q.x, points: 0, verdict: 'none', guess: true });
  await expect(page.getByTestId('play-verdict')).toContainText('not an analogy');
  expect((await state()).score).toBe(0);

  // The correct quad scores, then its four words leave the board to make room.
  for (const word of [p.x, p.y, q.x, q.y]) await pick(word);
  await expect.poll(() => page.evaluate(() => window.__lexical.stores.menuStore.lastPlay)).toMatchObject({ a: p.x, b: p.y, c: q.x, answer: q.y, points: 100, verdict: 'full', guess: true });
  await expect(page.getByTestId('play-verdict')).toContainText('a real analogy');
  expect((await state()).score).toBe(100);
  await expect.poll(async () => (await boardWords(page)).filter(w => [p.x, p.y, q.x, q.y].includes(w)), { timeout: 5_000 }).toEqual([]);

  // Nothing spawned: every word on the board was there before the guesses or dealt as a reward pair.
  const { dealt } = await state();
  await page.waitForTimeout(500);
  expect((await boardWords(page)).filter(word => !boardBefore.includes(word) && !dealt.includes(word))).toEqual([]);
});

test('plays are recorded in the local play log and can be downloaded without the device id', async ({ page }) => {
  await openSandbox(page, '2d');
  await wordBox(page).fill('king - man + woman');
  await wordBox(page).press('Enter');
  await expect(page.getByTestId('last-play')).toContainText('queen');
  await wordBox(page).fill('volcano');
  await wordBox(page).press('Enter');

  const summary = () => page.evaluate(() => (window.__lexical as unknown as { playLog(): Promise<{ byType: Record<string, number>; analogies: { hints: Record<string, number> } }> }).playLog());
  await expect.poll(async () => (await summary()).byType).toEqual({ analogy: 1, word: 1 });
  expect((await summary()).analogies.hints).toEqual({ carried: 1 });

  await page.locator('#analogies-toggle').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my play log' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^lexical-fountain-plays-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString('utf8'));
  const exported = JSON.parse(text);
  expect(exported.kind).toBe('lexical-fountain-play-log');
  expect(exported.events.map((e: { type: string }) => e.type)).toEqual(['analogy', 'word']);
  expect(exported.events[0].payload).toMatchObject({ a: 'man', b: 'king', c: 'woman', answer: 'queen', input: 'typed', hint: 'carried' });
  expect(text).not.toContain('deviceId');
});

test.describe('privacy: consent, age question, export, erase', () => {
  const playThree = async (page: Page) => {
    for (const expression of ['king - man + woman', 'paris - france + italy', 'puppy - dog + cat']) {
      await wordBox(page).fill(expression);
      await wordBox(page).press('Enter');
      await expect(page.getByTestId('last-play')).toBeVisible();
      await page.waitForTimeout(300);
    }
  };
  const consentOf = (page: Page) => page.evaluate(() => (window.__lexical.stores as unknown as { privacyStore: { consent?: { researchId: string } } }).privacyStore.consent ?? null);

  test('after three plays the prompt asks; an adult shares; sharing can be stopped', async ({ page }) => {
    await openSandbox(page, '2d');
    await expect(page.getByTestId('consent-prompt')).toHaveCount(0);
    await playThree(page);
    const prompt = page.getByTestId('consent-prompt');
    await expect(prompt).toContainText('Nothing is sent until our research server goes live');
    await prompt.getByRole('button', { name: 'Yes, share my plays' }).click();
    await prompt.getByLabel('What year were you born?').fill('1990');
    await prompt.getByRole('button', { name: 'Continue' }).click();
    await expect(prompt).toContainText('Your plays will help research');
    expect((await consentOf(page))?.researchId).toMatch(/[0-9a-f-]{36}/);

    await page.locator('#privacy-toggle').click();
    const panel = page.getByTestId('privacy-panel');
    await expect(panel.getByTestId('consent-status')).toHaveText('on');
    await panel.getByRole('button', { name: 'Stop sharing' }).click();
    await expect(panel.getByTestId('consent-status')).toHaveText('off');
    expect(await consentOf(page)).toBeNull();
  });

  test('a child keeps playing locally: no consent, no prompt, and no retry right away', async ({ page }) => {
    await openSandbox(page, '2d');
    await playThree(page);
    const prompt = page.getByTestId('consent-prompt');
    await prompt.getByRole('button', { name: 'Yes, share my plays' }).click();
    await prompt.getByLabel('What year were you born?').fill(String(new Date().getFullYear() - 10));
    await prompt.getByRole('button', { name: 'Continue' }).click();
    await expect(prompt).toContainText('Your plays stay on this device');
    expect(await consentOf(page)).toBeNull();
    await prompt.getByRole('button', { name: 'close' }).click();
    await expect(page.getByTestId('consent-prompt')).toHaveCount(0);

    await page.locator('#privacy-toggle').click();
    await expect(page.getByTestId('privacy-panel')).toContainText('Your plays stay on this device');
    await expect(page.getByTestId('privacy-panel').getByRole('button', { name: 'Share my plays' })).toHaveCount(0);
  });

  test('export all my data leaves out the device secret; erase starts a fresh profile', async ({ page }) => {
    await openSandbox(page, '2d');
    await wordBox(page).fill('king - man + woman');
    await wordBox(page).press('Enter');
    await expect(page.getByTestId('last-play')).toContainText('queen');
    // Discovery earns no points; a correct guess does (Feature 2.13).
    expect(await scoreOf(page)).toBe(0);
    await earnGuessPoints(page);

    await page.locator('#privacy-toggle').click();
    const panel = page.getByTestId('privacy-panel');
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Export all my data' }).click()]);
    const text = await (await download.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString('utf8'));
    const exported = JSON.parse(text);
    expect(exported.kind).toBe('lexical-fountain-my-data');
    expect(exported.analogies.map((a: { id: string }) => a.id)).toContain('man:king::woman');
    expect(exported.profile.score).toBe(100);
    expect(text).not.toContain('deviceSecret');

    await panel.getByRole('button', { name: 'Erase this device' }).click();
    await Promise.all([page.waitForEvent('load'), panel.getByRole('button', { name: 'Erase everything' }).click()]);
    await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => (window.__lexical.stores.menuStore as unknown as { score: number }).score)).toBe(0);
    const summary = await page.evaluate(() => (window.__lexical as unknown as { playLog(): Promise<{ events: number }> }).playLog());
    expect(summary.events).toBe(0);
  });
});

test('letters mode builds its merge rules from the vocabulary; the old dictionary is never downloaded', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
  const dictionaryLoaded = () => page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('combinationOfAllDict')));
  await page.locator('#sandbox-toggle').click();
  await page.waitForFunction(`(${lettersWorld})()?.collisionHandler.tools?.source === 'vocabulary'`, null, { timeout: 15_000 });
  const canvas = (await page.locator('#worldContainter canvas').first().boundingBox())!;
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(canvas.x + 400 + (i % 3) * 6, canvas.y + 150);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1_000);
  expect(await dictionaryLoaded()).toBe(false);
});

/** The original letter game: dropped letters merge when the pair occurs in dictionary words. */
type LettersWorld = {
  collisionHandler: { tools?: { source: string } };
  typographyDisplay: { carryList(): string[] };
  shapesFac: {
    boxes: { text: string; body?: unknown }[];
    previewBoxes: { text: string; body: { position: { x: number; y: number } } }[];
  };
};
const lettersWorld = () => (window.__lexical.deps as unknown as { activeWorld?: LettersWorld }).activeWorld;

test('letters mode: dropped letters combine into words on a fresh page (T + H + E -> "the")', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
  await page.bringToFront();
  await page.locator('#sandbox-toggle').click();
  // The dictionary is fetched when letters mode opens, so the very first contact can merge.
  await page.waitForFunction(`(${lettersWorld})()?.collisionHandler.tools !== undefined`, null, { timeout: 15_000 });

  const canvas = (await page.locator('#worldContainter canvas').first().boundingBox())!;
  const letters = () => page.evaluate(`(${lettersWorld})().shapesFac.boxes.filter(b => b.body).map(b => b.text)`) as Promise<string[]>;
  const drop = async (letter: string, heightAboveFloor: number) => {
    const preview = await page.evaluate(`(${lettersWorld})().shapesFac.previewBoxes.find(b => b.text.toUpperCase() === '${letter}').body.position`) as { x: number; y: number };
    await page.mouse.click(canvas.x + preview.x, canvas.y + preview.y);
    // Short drops keep impacts inside the merge strength band (hard impacts never merged, by design).
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height - heightAboveFloor);
  };
  await drop('T', 90);
  await page.waitForTimeout(800);
  await drop('H', 150);
  await expect.poll(letters, { timeout: 5_000 }).toEqual(['th']);
  await drop('E', 160);
  await expect.poll(letters, { timeout: 5_000 }).toEqual(['the']);
});

test('one board across modes: a word spelled in letters mode carries into Discovery, then into Guess', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
  await page.evaluate(() => { window.__lexical.stores.gameStore.setHintMode(true); window.__lexical.stores.gameStore.setDimension('2d'); });
  await page.bringToFront();
  await page.locator('#sandbox-toggle').click();
  await page.waitForFunction(`(${lettersWorld})()?.collisionHandler.tools !== undefined`, null, { timeout: 15_000 });

  const canvas = (await page.locator('#worldContainter canvas').first().boundingBox())!;
  const letters = () => page.evaluate(`(${lettersWorld})().shapesFac.boxes.filter(b => b.body).map(b => b.text)`) as Promise<string[]>;
  const drop = async (letter: string, heightAboveFloor: number) => {
    const preview = await page.evaluate(`(${lettersWorld})().shapesFac.previewBoxes.find(b => b.text.toUpperCase() === '${letter}').body.position`) as { x: number; y: number };
    await page.mouse.click(canvas.x + preview.x, canvas.y + preview.y);
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height - heightAboveFloor);
  };
  // E + A + T merge into "eat" or "tea" (the merge picks the more frequent letter order); both are words.
  await drop('E', 90);
  await page.waitForTimeout(800);
  await drop('A', 150);
  await expect.poll(async () => (await letters()).length, { timeout: 5_000 }).toBe(1);
  await drop('T', 160);
  await expect.poll(async () => (await letters()).map(t => t.length), { timeout: 5_000 }).toEqual([3]);
  const [word] = await letters();
  expect(['eat', 'tea']).toContain(word);
  // The word is outlined and listed as one that carries into Discovery.
  expect(await page.evaluate(`(${lettersWorld})().typographyDisplay.carryList()`)).toEqual([word]);

  // Discovery shows the carried word instead of a random board.
  await page.locator('#fountain-toggle').click();
  await expect(page.getByTestId('mode-tag')).toHaveText('Discovery');
  await expect.poll(() => boardWords(page), { timeout: 15_000 }).toEqual([word]);
  await page.waitForTimeout(1_000);
  expect(await boardWords(page)).toEqual([word]);

  // Guess deals its relation pairs next to the carried word.
  await page.locator('#game-toggle').click();
  await expect(page.getByTestId('round-relation')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await boardWords(page)).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(11);
  expect(await boardWords(page)).toContain(word);

  // Back in letters mode, the letter board is as it was left.
  await page.locator('#sandbox-toggle').click();
  await page.waitForFunction(`(${lettersWorld})()?.collisionHandler.tools !== undefined`, null, { timeout: 15_000 });
  await expect.poll(letters, { timeout: 10_000 }).toEqual([word]);
});

// ---- accounts: sign-in without Google (local test personas), sync, and several accounts per device ----

type AccountHandle = { account: { devSignIn(s: string): Promise<void>; signOut(): Promise<void>; syncNow(): Promise<void>; state(): { user?: { uid: string }; status: string } } };
const accountOf = (page: Page) => page.evaluate(() => (window.__lexical as unknown as AccountHandle).account.state());
const scoreOf = (page: Page) => page.evaluate(() => (window.__lexical.stores.menuStore as unknown as { score: number }).score);

/** Points come only from correct guesses (Discovery earns none): play one in a Guess round, then return to Discovery. */
async function earnGuessPoints(page: Page) {
  const before = await scoreOf(page);
  await page.locator('#game-toggle').click();
  await expect(page.getByTestId('round-relation')).toBeVisible({ timeout: 20_000 });
  const quad = await page.evaluate(() => (window.__lexical as unknown as { guess: { playCorrect(): Promise<string[] | null> } }).guess.playCorrect());
  expect(quad).not.toBeNull();
  await expect.poll(() => scoreOf(page)).toBe(before + 100);
  await page.locator('#fountain-toggle').click();
  await expect(page.getByTestId('mode-tag')).toHaveText('Discovery');
}
const analogyIds = (page: Page) => page.evaluate(async () => {
  const data = await (window.__lexical.semanticEngine as unknown as { exportAllData(): Promise<{ analogies: { id: string }[] }> }).exportAllData();
  return data.analogies.map(a => a.id).sort();
});
const readyAfterReload = (page: Page) =>
  page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });

/** Signs in as a local test persona. Switching accounts reloads into that account's own database. */
async function signInAs(page: Page, subject: string) {
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(s => { void (window.__lexical as unknown as AccountHandle).account.devSignIn(s); }, subject),
  ]);
  await readyAfterReload(page);
  await expect.poll(async () => (await accountOf(page)).user?.uid, { timeout: 20_000 }).toBe(`dev:${subject}`);
  await expect.poll(async () => (await accountOf(page)).status, { timeout: 20_000 }).toBe('synced');
}

async function playAs(page: Page, expression: string) {
  await wordBox(page).fill(expression);
  await wordBox(page).press('Enter');
  await expect(page.getByTestId('last-play')).toBeVisible();
}

test('two devices sign in to the same account (no Google) and converge through the API', async ({ browser }) => {
  test.setTimeout(120_000); // two browsers, each reloading into the account's database
  const subject = `e2e-player-${Date.now()}`;
  const devices = await Promise.all([browser.newContext(), browser.newContext()]);
  const [laptop, phone] = await Promise.all(devices.map(context => context.newPage()));
  await openSandbox(laptop, '2d');
  await openSandbox(phone, '2d');

  // Offline play as a guest on each device; the first account signed in on a device adopts that progress.
  await playAs(laptop, 'king - man + woman');
  await playAs(phone, 'paris - france + italy');
  await earnGuessPoints(laptop);
  await earnGuessPoints(phone);
  const expected = (await scoreOf(laptop)) + (await scoreOf(phone));
  expect(expected).toBe(200);

  await test.step('laptop signs in', () => signInAs(laptop, subject));
  await test.step('phone signs in', () => signInAs(phone, subject));
  await test.step('laptop syncs again', () => laptop.evaluate(() => (window.__lexical as unknown as AccountHandle).account.syncNow())); // receive the phone's plays

  await test.step('both converge', async () => {
    for (const page of [laptop, phone]) {
      await expect.poll(() => scoreOf(page)).toBe(expected);
      await expect.poll(() => analogyIds(page)).toEqual(['france:paris::italy', 'man:king::woman']);
    }
  });
  await laptop.locator('#privacy-toggle').click();
  await expect(laptop.getByTestId('account-user')).toHaveText(subject);
  await expect(laptop.getByTestId('sync-status')).toContainText('Synced');
  await Promise.all(devices.map(context => context.close()));
});

test('test personas are separate accounts on one device, each with its own progress', async ({ page }) => {
  test.setTimeout(120_000); // four account switches, each a reload
  const stamp = Date.now();
  const [novice, expert] = [`novice-${stamp}`, `expert-${stamp}`];
  await openSandbox(page, '2d');

  // First persona on this device: adopts the guest's (empty) progress, then plays.
  await signInAs(page, novice);
  await playAs(page, 'king - man + woman');
  await earnGuessPoints(page);
  const noviceScore = await scoreOf(page);
  await page.evaluate(() => (window.__lexical as unknown as AccountHandle).account.syncNow());

  // Second persona: a fresh account, nothing carried over.
  await signInAs(page, expert);
  expect(await scoreOf(page)).toBe(0);
  expect(await analogyIds(page)).toEqual([]);
  await playAs(page, 'paris - france + italy');
  await expect.poll(() => analogyIds(page)).toEqual(['france:paris::italy']);

  // Back to the first persona: its own progress, untouched by the other.
  await signInAs(page, novice);
  expect(await scoreOf(page)).toBe(noviceScore);
  expect(await analogyIds(page)).toEqual(['man:king::woman']);

  // The UI lists both personas for switching, and "Play as guest" returns to the guest's data.
  await page.locator('#privacy-toggle').click();
  await expect(page.getByTestId('account-switcher')).toContainText(expert);
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Play as guest' }).click()]);
  await readyAfterReload(page);
  expect((await accountOf(page)).user).toBeUndefined();
  expect(await scoreOf(page)).toBe(0);
});

test('personas have their own skill rating, and each is dealt relations of its level (Feature 2.12)', async ({ page }) => {
  test.setTimeout(120_000); // three account switches, each a reload
  const stamp = Date.now();
  const [novice, expert] = [`rated-novice-${stamp}`, `rated-expert-${stamp}`];
  type RatingHandle = { rating: { set(v: number): Promise<void>; get(): number }; guess: { playCorrect(): Promise<string[] | null> } };
  const roundRelation = async () => {
    await page.locator('#game-toggle').click();
    await expect(page.getByTestId('round-relation')).toBeVisible({ timeout: 20_000 });
    return page.evaluate(() => (window.__lexical.stores.gameStore as unknown as { relationDeal: { category: string } }).relationDeal.category);
  };
  // Effective difficulty eases relations made of obvious pairs (comparatives ~615, opposites ~550).
  const easy = ['family', 'gram2-opposite', 'gram3-comparative', 'gram4-superlative', 'gram5-present-participle', 'gram7-past-tense'];
  const hard = ['city-in-state', 'capital-world', 'capital-common-countries', 'gram6-nationality-adjective'];
  await openSandbox(page, '2d');

  await signInAs(page, novice);
  await page.evaluate(() => (window.__lexical as unknown as RatingHandle).rating.set(800));
  expect(easy).toContain(await roundRelation());
  // A correct guess raises the rating, and the HUD shows by how much.
  await page.evaluate(() => (window.__lexical as unknown as RatingHandle).guess.playCorrect());
  await expect.poll(() => page.evaluate(() => (window.__lexical as unknown as RatingHandle).rating.get())).toBeGreaterThan(800);
  await expect(page.getByTestId('player-rating')).toContainText('+');
  const noviceRating = await page.evaluate(() => (window.__lexical as unknown as RatingHandle).rating.get());
  await page.locator('#fountain-toggle').click();

  await signInAs(page, expert);
  expect(await page.evaluate(() => (window.__lexical as unknown as RatingHandle).rating.get())).toBe(1000);
  await page.evaluate(() => (window.__lexical as unknown as RatingHandle).rating.set(1600));
  expect(hard).toContain(await roundRelation());
  await page.locator('#fountain-toggle').click();

  await signInAs(page, novice);
  expect(await page.evaluate(() => (window.__lexical as unknown as RatingHandle).rating.get())).toBe(noviceRating);
});

test('Connect: a seeded puzzle is solved by typing bridge words; refused moves explain why (Feature 2.10)', async ({ page }) => {
  await openSandbox(page, '2d');
  await page.locator('#puzzle-toggle').click();
  await expect(page.getByTestId('mode-tag')).toHaveText('Connect');
  await expect(page.getByTestId('puzzle-hud')).toBeVisible({ timeout: 20_000 });
  type PuzzleHandle = { puzzle: { state(): { seed: number; words: string[]; par: number; solution: string[]; moves: string[] } | null } };
  const puzzle = () => page.evaluate(() => (window.__lexical as unknown as PuzzleHandle).puzzle.state()!);
  const start = await puzzle();
  await expect.poll(async () => (await boardWords(page)).sort(), { timeout: 20_000 }).toEqual([...start.words].sort());
  await expect(page.getByTestId('puzzle-progress')).toContainText(`of ${start.words.length}`);

  // A word already on the board is refused and costs no move.
  await wordBox(page).fill(start.words[0]);
  await wordBox(page).press('Enter');
  await expect(page.getByTestId('word-message')).toContainText('on the board already');
  expect((await puzzle()).moves).toEqual([]);

  // The solver's solution solves it at par, one typed word per move.
  for (const [i, word] of start.solution.entries()) {
    await wordBox(page).fill(word);
    await wordBox(page).press('Enter');
    await expect(page.getByTestId('puzzle-moves')).toContainText(`moves ${i + 1}`);
  }
  await expect(page.getByTestId('puzzle-solved')).toContainText(`Solved in ${start.par}`);
  await expect.poll(() => boardWords(page)).toEqual(expect.arrayContaining(start.solution));

  await page.getByRole('button', { name: 'Next puzzle' }).click();
  await expect.poll(async () => (await puzzle()).seed).toBeGreaterThan(start.seed);
  await expect(page.getByTestId('puzzle-solved')).toHaveCount(0);
});

test('saved sessions: save a board, reload it from another mode, and round-trip session and play-log files', async ({ page }) => {
  test.setTimeout(120_000);
  await openSandbox(page, '2d');
  await wordBox(page).fill('king - man + woman');
  await wordBox(page).press('Enter');
  await expect(page.getByTestId('last-play')).toContainText('queen');
  await wordBox(page).fill('zeitgeistly');
  await wordBox(page).press('Enter');
  await expect.poll(() => boardWords(page)).toContain('zeitgeistly');
  const saved = (await boardWords(page)).sort();

  // Save the board under a name.
  await page.locator('#sessions-toggle').click();
  const panel = page.getByTestId('sessions-panel');
  await panel.getByRole('textbox', { name: 'Session name' }).fill('royal test');
  await panel.getByRole('button', { name: 'Save this board' }).click();
  await expect(panel.getByTestId('saved-session')).toHaveCount(1);

  // Load it from letters mode: it reopens in Discovery with the same words and its analogy.
  await page.locator('#sandbox-toggle').click();
  await page.waitForTimeout(500);
  await panel.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByTestId('mode-tag')).toHaveText('Discovery');
  await expect.poll(async () => (await boardWords(page)).sort(), { timeout: 15_000 }).toEqual(saved);
  await expect.poll(() => page.evaluate(() => window.__lexical.stores.menuStore.boardAnalogies.map(a => a.answer))).toEqual(['queen']);

  // Download the session and upload the file: it is added as a second saved session.
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download', exact: true }).click()]);
  const sessionPath = await download.path();
  await panel.getByTestId('session-file').setInputFiles(sessionPath!);
  await expect(panel.getByTestId('saved-session')).toHaveCount(2);
  await expect(panel.getByTestId('sessions-message')).toContainText('Added "royal test"');

  // A play log downloaded here and uploaded into a fresh account merges its plays and restores added words.
  await page.locator('#analogies-toggle').click();
  const [logDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my play log' }).click()]);
  const logPath = await logDownload.path();
  // The first account on a device adopts the guest's progress, so a second persona is the fresh one.
  for (const who of ['adopter', 'importer']) {
    await Promise.all([page.waitForEvent('load'), page.evaluate(s => { void (window.__lexical as unknown as { account: { devSignIn(s: string): Promise<void> } }).account.devSignIn(s); }, `${who}-${Date.now()}`)]);
    await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 30_000 });
  }
  expect(await page.evaluate(() => Boolean(window.__lexical.semanticEngine.lookup('zeitgeistly')))).toBe(false);
  await page.locator('#sessions-toggle').click();
  await page.getByTestId('play-log-file').setInputFiles(logPath!);
  await expect(page.getByTestId('sessions-message')).toContainText('plays added', { timeout: 30_000 });
  await expect(page.getByTestId('sessions-message')).toContainText('1 words restored');
  expect(await page.evaluate(() => Boolean(window.__lexical.semanticEngine.lookup('zeitgeistly')))).toBe(true);
  expect(await page.evaluate(() => (window.__lexical.stores.menuStore as unknown as { score: number }).score)).toBe(0);
});
