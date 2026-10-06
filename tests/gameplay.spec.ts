import { test, expect, devices } from '@playwright/test';

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

/** Phones (the owner play-tests on one): taps, finger drags in Move mode, and the docking dashboard. */
test.describe('phone (touch)', () => {
  // The Pixel 7 profile without its browser choice (a describe group can't switch browsers).
  const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7'];
  test.use(pixel7);
  type Probe = { text: string; x: number; y: number };
  const boxes = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __lexical: { wordBoxes(): Probe[] } }).__lexical.wordBoxes());

  test('a tap selects a word once, and in Move mode a finger drags it', async ({ page, context }) => {
    await page.goto('/');
    await ready(page);
    await page.waitForFunction(() => ((window as unknown as { __lexical: { wordBoxes(): unknown[] } }).__lexical.wordBoxes().length) >= 5, null, { timeout: 30_000 });
    await page.waitForTimeout(2_000);
    const canvas = (await page.locator('#worldContainter canvas').first().boundingBox())!;
    const onCanvas = async () => {
      const all = await boxes(page);
      for (const b of all) {
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [canvas.x + b.x, canvas.y + b.y] as const);
        if (hit === 'CANVAS') return b;
      }
      throw new Error('no word on open canvas');
    };
    const selected = () => page.evaluate(() => [...(window as unknown as { __lexical: { stores: { menuStore: { selectedWordTexts: string[] } } } }).__lexical.stores.menuStore.selectedWordTexts]);

    // Phones zoom the board out so words fit (Task 5.7.0): medium word size is 0.7 on a ~400 px screen
    // (at most; a crowded board shrinks further), and the Aa button cycles small / medium / large.
    const zoom = () => page.evaluate(() => (window as unknown as { __lexical: { deps: { activeWorld: { shapesFac: { zoom: number } } } } }).__lexical.deps.activeWorld.shapesFac.zoom);
    expect(await zoom()).toBeLessThanOrEqual(0.7 + 1e-9);
    await page.getByTestId('word-size-toggle').tap(); // → large
    await expect.poll(zoom).toBeGreaterThan(0.75);
    await page.getByTestId('word-size-toggle').tap(); // → small
    await expect.poll(zoom).toBeLessThanOrEqual(0.5 + 1e-9);
    await page.getByTestId('word-size-toggle').tap(); // → medium again

    // A tap selects exactly once (before the fix the emulated mouse press could toggle it back).
    const word = await onCanvas();
    await page.touchscreen.tap(canvas.x + word.x, canvas.y + word.y);
    await expect.poll(selected).toEqual([word.text]);

    // Move mode: a finger grabs a word and carries it (p5 1.x never turned touchstart into mousePressed).
    await page.getByRole('menuitem', { name: 'Move: drag words around' }).tap();
    // Words drift under physics: touch one, and retry if the finger came down after it moved away.
    const cdp = await context.newCDPSession(page);
    const grabbed = () => page.evaluate(() => (window as unknown as { __lexical: { deps: { boxLastClicked?: { text: string } } } }).__lexical.deps.boxLastClicked?.text);
    let target = await onCanvas();
    let start = { x: canvas.x + target.x, y: canvas.y + target.y };
    for (let attempt = 0; attempt < 5; attempt++) {
      target = await onCanvas();
      start = { x: canvas.x + target.x, y: canvas.y + target.y };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      if (await grabbed()) break;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    expect(await grabbed()).toBe(target.text);
    // Drag toward the middle of the board (a held word stops at the board's edge).
    const [sx, sy] = [target.x < canvas.width / 2 ? 10 : -10, target.y > canvas.height / 2 ? -6 : 6];
    for (let s = 1; s <= 10; s++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + sx * s, y: start.y + sy * s }] });
      await page.waitForTimeout(30);
    }
    // Measured while the finger is still down (the word is held where the finger is).
    await expect.poll(async () => {
      const moved = (await boxes(page)).find(b => b.text === target.text);
      return moved ? Math.hypot(moved.x - target.x, moved.y - target.y) : 0;
    }, { timeout: 5_000 }).toBeGreaterThan(80);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Released words stay on the board (dragging past the edge used to delete them).
    expect((await boxes(page)).map(b => b.text)).toContain(target.text);
  });

  test('tapping the dashboard header docks it as a small top-right chip, and tapping the chip restores it', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const viewport = page.viewportSize()!;
    const dashboard = page.getByTestId('dashboard-handle').locator('xpath=ancestor::div[contains(@class, "Dashboard")][1]');
    const open = (await dashboard.boundingBox())!;
    expect(open.height).toBeGreaterThan(120);

    // Docked top-right (words pile up at the bottom under gravity).
    await page.getByTestId('dashboard-handle').tap();
    await expect.poll(async () => (await dashboard.boundingBox())!.height).toBeLessThan(80);
    const docked = (await dashboard.boundingBox())!;
    expect(docked.y).toBeLessThan(60);
    expect(docked.x + docked.width).toBeGreaterThan(viewport.width - 40);

    await page.getByTestId('dashboard-handle').tap();
    await expect.poll(async () => (await dashboard.boundingBox())!.height).toBeGreaterThan(120);
  });
});
