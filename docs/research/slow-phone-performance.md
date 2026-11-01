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

## Limitations

- **Emulation, not a phone:** CPU throttling scales the main thread only. A real phone's GPU, memory, and thermal limits are not modelled, and the machine's RTX 3090 is far faster than any phone GPU.
- **Shared-machine noise:** other projects ran on the machine. One software-mode run took 10.5 s to load (left out of the ranges above, but kept in the results file).
- **No network:** load times are on loopback.
- **Probe fixes along the way:** words queued before the 2D world exists are dropped (the world clears the spawn queue on start), so the probe waits for the world first. A probe step that times out must still close its browser, so `measure` uses `try/finally`.
