// Slow-phone main-thread baseline (docs/research/slow-phone-performance.md, Epic 4 · Task 4.5.15).
// What a player on a low-end phone feels: the vocabulary load, 2D physics at 40 words, and the 3D view at 40 words,
// on an emulated Pixel 7 at 1x and 4x CPU throttle (CDP Emulation.setCPUThrottlingRate).
// Per phase: requestAnimationFrame rate, frame-gap p95 and maximum, and long-task time per second (tasks that overlap
// the window, not only those that start in it; see CLAUDE.md § Lessons "Slow-phone checks").
//
// Reproduce (bundle built and served from C:, never inside the synced tree):
//   npx vite build --mode e2e --outDir <scratch>/dist-e2e --emptyOutDir
//   npx vite preview --outDir <scratch>/dist-e2e --port 41944 --strictPort
//   BASE_URL=http://127.0.0.1:41944/ node docs/research/experiments/browser/slowPhone.probe.mjs > <scratch>/slow-phone.json
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41944/';
const RUNS = Number(process.env.RUNS ?? 2);
const WINDOW_MS = 6000;
const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7'];

/** Installed before any page script: records every rAF gap and every long task with timestamps. */
function recorder() {
    window.__frames = [];
    let last = performance.now();
    const tick = t => { window.__frames.push([t, t - last]); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__longTasks = [];
    try {
        new PerformanceObserver(list => list.getEntries().forEach(e => window.__longTasks.push([e.startTime, e.duration])))
            .observe({ type: 'longtask', buffered: true });
    } catch { /* no long-task API */ }
}

/** Frame and long-task statistics for the window [t0, t1] (page clock). */
function stats([t0, t1]) {
    const gaps = window.__frames.filter(([t]) => t > t0 && t <= t1).map(([, g]) => g).sort((a, b) => a - b);
    const overlap = window.__longTasks.reduce((sum, [s, d]) => sum + Math.max(0, Math.min(s + d, t1) - Math.max(s, t0)), 0);
    const seconds = (t1 - t0) / 1000;
    return {
        seconds: +seconds.toFixed(2),
        fps: +(gaps.length / seconds).toFixed(1),
        gapP95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
        gapMax: Math.round(gaps[gaps.length - 1] ?? 0),
        longTaskMsPerSecond: Math.round(overlap / seconds),
        longTasks: window.__longTasks.filter(([s, d]) => s + d > t0 && s < t1).length,
    };
}

async function phase(page, run) {
    const t0 = await page.evaluate(() => performance.now());
    await run();
    const t1 = await page.evaluate(() => performance.now());
    return page.evaluate(stats, [t0, t1]);
}

// Headless Chromium renders WebGL in software (SwiftShader) unless told to use the GPU: GPU=1 uses the machine's GPU
// (optimistic for a phone's GPU), the default is software GL (pessimistic for 3D). The CPU throttle applies to both.
const GPU_ARGS = process.env.GPU === '1' ? ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : [];

async function measure(throttle) {
    const browser = await chromium.launch({ args: GPU_ARGS });
    // Close the browser even when a step times out: an uncaught error otherwise leaves it running.
    try {
        return await measureIn(browser, throttle);
    } finally {
        await browser.close();
    }
}

async function measureIn(browser, throttle) {
    const context = await browser.newContext(pixel7);
    await context.addInitScript(recorder);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const out = {};

    // 1. First load until the vocabulary is ready (window from navigation start).
    await page.goto(BASE, { timeout: 180_000 });
    await page.bringToFront();
    await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === 'ready', null, { timeout: 180_000, polling: 100 });
    const readyAt = await page.evaluate(() => performance.now());
    out.load = { readyMs: Math.round(readyAt), ...(await page.evaluate(stats, [0, readyAt])) };

    // 2. 2D physics at 40 words (Discovery, hint mode on, the default 2D world). Wait for the world and its first
    // board: a world clears the spawn queue when it starts, so words queued before it exists are dropped.
    await page.waitForFunction(() => window.__lexical.deps.activeWorld?.dimension === '2d' && window.__lexical.deps.activeWorld.wordTexts().length >= 8, null, { timeout: 60_000 });
    await page.evaluate(() => {
        const { stores, deps, semanticEngine } = window.__lexical;
        stores.gameStore.setHintMode(true);
        stores.gameStore.setDimension('2d');
        const onBoard = new Set(deps.activeWorld?.wordTexts() ?? []);
        semanticEngine.randomWords(60).filter(w => !onBoard.has(w)).slice(0, 40 - onBoard.size).forEach(word => deps.pendingWordSpawns.push({ word }));
    });
    await page.waitForFunction(() => (window.__lexical.deps.activeWorld?.wordTexts().length ?? 0) >= 40, null, { timeout: 60_000 });
    await page.waitForTimeout(2000); // spawns settle
    out.physics2d = await phase(page, () => page.waitForTimeout(WINDOW_MS));

    // 3. Switch to 3D (the switch itself), then the 3D view at rest-ish with the same 40 words.
    out.switchTo3d = await phase(page, async () => {
        await page.evaluate(() => window.__lexical.stores.gameStore.setDimension('3d'));
        await page.waitForFunction(() => window.__lexical.deps.activeWorld?.dimension === '3d' && window.__lexical.deps.activeWorld.wordTexts().length >= 40, null, { timeout: 60_000 });
    });
    await page.waitForTimeout(2000);
    out.view3d = await phase(page, () => page.waitForTimeout(WINDOW_MS));
    out.words = await page.evaluate(() => window.__lexical.deps.activeWorld.wordTexts().length);

    // 4. Back to 2D, then 3D again: the three.js code is loaded now, so the second switch is only the scene build.
    out.switchTo2d = await phase(page, async () => {
        await page.evaluate(() => window.__lexical.stores.gameStore.setDimension('2d'));
        await page.waitForFunction(() => window.__lexical.deps.activeWorld?.dimension === '2d' && window.__lexical.deps.activeWorld.wordTexts().length >= 40, null, { timeout: 60_000 });
    });
    await page.waitForTimeout(2000);
    out.switchTo3dAgain = await phase(page, async () => {
        await page.evaluate(() => window.__lexical.stores.gameStore.setDimension('3d'));
        await page.waitForFunction(() => window.__lexical.deps.activeWorld?.dimension === '3d' && window.__lexical.deps.activeWorld.wordTexts().length >= 40, null, { timeout: 60_000 });
    });

    return out;
}

const results = { base: BASE, device: 'Pixel 7 (emulated)', gl: process.env.GPU === '1' ? 'gpu' : 'software (SwiftShader)', windowMs: WINDOW_MS, runs: [] };
for (let run = 0; run < RUNS; run++) {
    for (const throttle of [1, 4]) results.runs.push({ run, throttle, ...(await measure(throttle)) });
}
console.log(JSON.stringify(results, null, 2));
