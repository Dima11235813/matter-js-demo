# Slow phones: where the main thread stalls (baseline, 2026-11-01)

Drives: [Epic 4 · Task 4.5.15](../../proj-mgmt/epic-4-modernization.md). Follows Task 2.10.6 (the Connect deal stall, fixed with a worker).
Owner, 2026-10-18: "important for this app to work well on low resource mobile devices".

Reproduce:
1. Build into the scratchpad on `C:`: `npx vite build --mode e2e --outDir <scratch>/dist-e2e --emptyOutDir`.
2. Serve it: `npx vite preview --outDir <scratch>/dist-e2e --port 41944 --strictPort`.
3. Run the probe: `[GPU=1] BASE_URL=http://127.0.0.1:41944/ RUNS=3 node docs/research/experiments/browser/slowPhone.probe.mjs`.

The probe is [`slowPhone.probe.mjs`](experiments/browser/slowPhone.probe.mjs); the results are in [`results/slow-phone-baseline.json`](experiments/results/slow-phone-baseline.json).

## Question

Which player actions freeze the page on a slow phone, and by how much? The roadmap has asked since 2026-10-18 to measure the 3D view, 2D physics at 40 words, and the vocabulary load before changing any of them.

## Method

**Setup:** an emulated Pixel 7 (Playwright device profile: 412 × 839, touch) at 1× and 4× CPU throttle (CDP `Emulation.setCPUThrottlingRate`), 3 runs each, at commit `883e049`.

**Phases:**
- first load until the vocabulary is ready;
- 2D physics with 40 words, for 6 s;
- the first 2D → 3D switch;
- the 3D view with 40 words, for 6 s;
- 3D → 2D;
- a second 2D → 3D switch.

**What it reports per phase:**
- the frame rate;
- the frame gap at p95, and the longest gap (what the player feels as a freeze);
- long-task time per second, counting tasks that **overlap** the window, as the "Slow-phone checks" lesson in `CLAUDE.md` requires.

**GPU caveat:** headless Chromium renders WebGL and canvas **in software** (SwiftShader) unless told to use the GPU. A profile of the 3D switch in software mode spent 1,262 of 1,682 ms in native "(program)" time, which is GPU work done on the CPU. So the probe runs two ways:
- **GPU** (`GPU=1`, the machine's RTX 3090): optimistic for a phone's GPU;
- **software:** pessimistic.

A real low-end phone sits between the two.

## Findings

**GPU mode** (the realistic case for a phone with any GPU), ranges over 3 runs:

| Phase | 1× CPU | 4× CPU (slow phone) |
|---|---|---|
| **Load until the vocabulary is ready** | 0.41–0.91 s; worst gap 150–267 ms | **1.2–2.8 s; worst gap 283–800 ms**; 4–7 long tasks (488–712 ms of long tasks per second) |
| 2D physics, 40 words | 57–60 fps | **56–60 fps** (one run had one 183 ms gap) |
| **First switch 2D → 3D** | 0.25–0.37 s; worst gap 50–133 ms | **0.6–1.1 s; worst gap 250–350 ms**; 2–6 long tasks |
| 3D view, 40 words | 58–60 fps | **56–60 fps** (one run had one 217 ms gap) |
| 3D → 2D | 0.35–0.36 s, smooth | 0.5–0.65 s; worst gap 117–183 ms |
| Second switch 2D → 3D | 0.18–0.23 s | **0.26–0.34 s; worst gap 50–67 ms; no long tasks** |

**Software mode** (no usable GPU) at 4×:
- 2D physics 30–56 fps; 3D view 23–37 fps;
- both switches 0.8–1.3 s, worst gap 117–383 ms;
- the second switch is no faster, because the cost is rendering, not code.

**What the numbers say:**
1. **Steady play is fine** with a GPU, even at 4× CPU: 2D and 3D both hold about 60 fps with 40 words. Without a GPU, both drop to 23–56 fps.
2. **The worst stall is start-up:** from navigation until the vocabulary is ready, 1.2–2.8 s at 4×, with single freezes of up to **800 ms**. This is on loopback; a phone also downloads the bundle and the 8 MB vocabulary.
   - A profile (4×, GPU) found no single hot function. It's script parse and compile ("(program)" 296 ms), React's first render (~210 ms inclusive), and the vocabulary decode, spread over several tasks.
   - Attributing it needs a source-mapped profile (a build with `--sourcemap hidden` into the scratchpad).
3. **The first 3D switch costs 0.6–1.1 s** (worst gap 250–350 ms), while a repeat switch costs 0.26–0.34 s with no long tasks. So with a GPU, most of the first switch is loading the 3D code: the three.js chunk's download and compile, and the first shader compile. Building the scene is the small part.

## Proposed fixes (each to be measured against this baseline)

| # | Fix | Expected effect | Measure |
|---|---|---|---|
| F1 | **Prefetch the 3D chunk** in idle time once the page is ready and hint mode is on (`import("./space/SpaceWorld")` from `requestIdleCallback`) | First switch closer to the repeat switch (0.3 s, no long tasks) | `switchTo3d` at 4×, GPU mode |
| F2 | **Attribute start-up** with a source-mapped profile, then split the largest piece. Candidates: decode the vocabulary in a worker (the candidate vectors already go to the Connect worker), defer non-visible panels from React's first render | The longest start-up freeze under 200 ms | `load` gap max at 4× |
| F3 | (no GPU) Lower the frame cost on software-rendered devices: fewer redraws while the board is at rest, smaller canvas pixel ratio | Software-mode fps toward 50 | `physics2d`, `view3d` in software mode |

**Recommended order:** F1 first (small, clear win, easy to verify), then F2, the biggest stall but one that needs attribution first.

## F1 shipped: an instant 2D → 3D switch (2026-11-01)

**Owner's report:** "it looked like the words didn't transfer over when I switched to 3D". During the switch the 2D world was destroyed before the 3D code had loaded, so the board went blank, and then the words trickled in four per frame.

**Changes** (branch `feature/instant-3d-switch`):
1. **Preload:** the 3D view's code loads in an idle callback once the vocabulary is ready and hint mode is on (`load3d` in `src/WordWorld.tsx`, cached).
2. **One WebGL renderer for every 3D world** (`src/space/sharedRenderer.ts`): the context and the compiled shader programs survive switches. A second idle callback warms it up, compiling the view's shaders on a two-word sample scene built by the same `SpaceScene`, with `compileAsync`.
   - A profile of the first switch had shown about 150 ms of JavaScript in program compiles, plus 431 ms of native time.
   - The warm scene is kept alive, because three.js frees a program once no material uses it.
3. **No blank board:** a 2D ↔ 3D switch keeps the current world on screen until the next one's code is loaded, then swaps them in one task. A view change (letters, Discovery, Guess) still tears down at once.
4. **The whole board in the first frame:** a handed-over board is placed in one go, with molecules restored at once, instead of four words per frame.

**Measured** (same probe, GPU mode, emulated Pixel 7, 40 words; baseline `883e049` and the change alternated run by run, 3 runs each; [results](experiments/results/slow-phone-instant-3d.json)):

| | Before, 1× | After, 1× | Before, 4× | After, 4× |
|---|---|---|---|---|
| First switch to 3D | 0.24–0.26 s | **0.05–0.12 s** | 0.36–0.38 s (worst frame 117–133 ms) | **0.18–0.20 s** (one frame of 133–150 ms) |
| Later switches | 0.21–0.22 s | **0.03–0.04 s** | 0.23–0.25 s | **0.07–0.11 s** |
| 5 s after start-up (the preload lands here) | 60 fps, worst 17 ms | 60 fps, worst 17 ms | worst 17–100 ms | worst 33–50 ms, one ~55–70 ms task |
| 2D play, 3D view | unchanged, 60 fps | unchanged | unchanged | unchanged |

**What remains in the first switch at 4×** is one frame of about 130–150 ms: building the 40 label textures, the first simulation step, and texture upload.

**Measurement correction:** the first comparison ended the switch window when the words existed. Once the board appeared in one go, that was before the first 3D frame was drawn, which hid the freeze. Switch windows now end two animation frames after the new world exists with an empty spawn queue, and the comparison above used that rule.

**Test:** e2e "switching to 3D shows the whole board in the first 3D frame, and the 3D view was preloaded" (real toggle; reads the board in the frame the 3D world appears). It fails on the old build, at the preload check; passes on the change; the full suite is 40 of 40.

**Found along the way:** a word can be lost when the board comes back from 3D to 2D on a crowded phone board (40 → 39 in 2 of 24 measured runs, once on each build, so it's not caused by this change). Logged as Epic 4 · Task 4.5.16.

## Limitations

- **Emulation, not a phone:** CPU throttling scales the main thread only. A real phone's GPU, memory, and thermal limits are not modelled, and the machine's RTX 3090 is far faster than any phone GPU.
- **Shared-machine noise:** other projects ran on the machine. One software-mode run took 10.5 s to load (left out of the ranges above, but kept in the results file).
- **No network:** load times are on loopback.
- **Probe fixes along the way:** words queued before the 2D world exists are dropped (the world clears the spawn queue on start), so the probe waits for the world first. A probe step that times out must still close its browser, so `measure` uses `try/finally`.
