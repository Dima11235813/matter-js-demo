// Reproduce: start the dev server (npx vite: port 41940, ports.config.ts), then
//   node docs/research/experiments/browser/lettersMergeRules.probe.mjs current,vocab,vocab8k,prefix,prefixCurrent 4
// "current" measures whatever letters mode ships; the others override its rules in the page.
// Compare letter dictionaries: sprinkle 40 letters, count real words vs fragments.
import { chromium } from "playwright";

const variants = (process.argv[2] ?? "current,vocab,vocab8k").split(",");
const trials = Number(process.argv[3] ?? 4);
import fs from "node:fs";
const stopText = fs.readFileSync(new URL("../../../../data/vocab/stopwords.txt", import.meta.url), "utf8");
const browser = await chromium.launch();
const results = {};
for (const variant of variants) {
  results[variant] = [];
  for (let t = 0; t < trials; t++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto("http://127.0.0.1:41940/", { timeout: 120000 });
    await page.waitForFunction(() => window.__lexical?.stores.menuStore.engineStatus === "ready", null, { timeout: 120000 });
    await page.bringToFront();
    await page.locator("#sandbox-toggle").click();
    await page.waitForFunction(() => window.__lexical.deps.activeWorld?.collisionHandler?.tools, null, { timeout: 30000 });
    const buildMs = await page.evaluate(async ([variant, stopText]) => {
      const m = await import("/src/utils/textUtils.ts");
      const stop = stopText.split(/\r?\n/).map(s => s.trim()).filter(s => /^[a-z]+$/.test(s));
      const index = window.__lexical.semanticEngine.loaded.index;
      const vocab = n => { const out = []; for (let i = 0; i < Math.min(n, index.baseSize); i++) { const w = index.baseWordAt(i); if (/^[a-z]{2,10}$/.test(w)) out.push(w); } return out; };
      const real = new Set([...vocab(1e9), ...stop]);
      window.__real = real;
      if (variant === "current") return 0;
      if (variant.startsWith("prefix")) {
        const h = window.__lexical.deps.activeWorld.collisionHandler;
        const source = variant === "prefixCurrent" ? Object.keys(h.tools.dict).filter(w => /^[a-z]{2,10}$/i.test(w)).map(w => w.toLowerCase()) : [...vocab(1e9), ...stop];
        const t0 = performance.now();
        const combos = [];
        for (const w of source) for (let k = 2; k <= w.length; k++) { const p = w.slice(0, k); (combos[k] ??= {})[p] = (combos[k][p] ?? 0) + 1; }
        h.tools.letterCombos = combos;
        return Math.round(performance.now() - t0);
      }
      const words = variant === "vocab" ? [...vocab(1e9), ...stop] : [...vocab(8000), ...stop];
      const t0 = performance.now();
      const tools = new m.DictionaryTools(Object.fromEntries(words.map(w => [w, 1])));
      const ms = performance.now() - t0;
      window.__lexical.deps.activeWorld.collisionHandler.tools = tools;
      return Math.round(ms);
    }, [variant, stopText]);
    const canvas = await page.locator("#worldContainter canvas").first().boundingBox();
    let seed = 11 + t;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      await page.mouse.click(canvas.x + 150 + rnd() * 900, canvas.y + 120 + rnd() * 250);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(4000);
    const r = await page.evaluate(() => {
      const texts = window.__lexical.deps.activeWorld.shapesFac.boxes.filter(b => b.body).map(b => b.text.toLowerCase());
      const realWords = texts.filter(s => s.length >= 3 && window.__real.has(s));
      const fragments = texts.filter(s => s.length >= 2 && !window.__real.has(s));
      return { boxes: texts.length, realWords, fragments: fragments.length };
    });
    results[variant].push({ ...r, buildMs });
    console.log(variant, t, JSON.stringify({ ...r, buildMs }));
    await page.close();
  }
}
for (const [v, rs] of Object.entries(results)) {
  const avg = k => (rs.reduce((s, r) => s + (Array.isArray(r[k]) ? r[k].length : r[k]), 0) / rs.length).toFixed(1);
  console.log(`SUMMARY ${v}: boxes ${avg("boxes")}, real words(>=3) ${avg("realWords")}, fragments ${avg("fragments")}, build ${avg("buildMs")} ms`);
}
await browser.close();
