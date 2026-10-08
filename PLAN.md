# CubeLab — Build Plan

An interactive Rubik's Cube solver and algorithm laboratory. Portfolio-grade, DSA-focused.
Algorithms implemented from scratch. Runs fully in the browser, no server.

## Key environment decision
This environment has **Node 24 / npm 11** but **no cmake, no emscripten, and only an
ancient MinGW g++ 6.3.0** (incomplete C++17). The spec explicitly allows the fallback:
> "If Emscripten is unavailable… write the engine in TypeScript first behind the same
> interface, then port later. Keep a clean `Solver` interface so both can plug in."

**Decision:** Implement the engine in **TypeScript** inside `engine/`, behind a clean,
language-agnostic `Solver` interface, architected so a later C++17/WASM port drops in
without touching the web app. This is documented in README → Limitations.

## Repo layout (npm workspaces)
```
engine/     TS core: cube model, solvers, PDBs, bench CLI, Vitest tests
web/        Vite + TS + three.js app (imports @cubelab/engine)
docs/       RESEARCH.md, CONVENTIONS.md, BENCHMARK_ANALYSIS.md, benchmarks/, screenshots
.github/    CI workflow
README.md   (written last)
LICENSE     MIT
```

## Phase checklist

- [x] **Phase 0 — Research.** Web-search cubing + UI references; write `docs/RESEARCH.md`
      (what taken / what done differently). Scaffold repo (workspaces, TS, Vitest, licenses).
      Commit. ✅ Done. (Env note: WSL has g++15/cmake4 but **no emscripten** → TS-first engine
      confirmed; all npm/git must run inside WSL, Windows npm mangles the UNC path.)
- [x] **Phase 1 — Cube model + tests.** Cubie model (8 corners/12 edges, perm+orient),
      18 move tables, compose/invert, `docs/CONVENTIONS.md`, structured validity checker,
      seeded uniform-random valid-state generator. Full Vitest suite. ✅ 22 tests green
      (incl. superflip oracle + 300-sequence facelet↔cubie agreement). Geometric 3D model
      derives move tables, so orientation constants aren't hand-entered.
- [x] **Phase 2 — Solvers** ✅ (each behind `Solver`, reporting nodes/time/memory/length,
      timeout + cancel). 43 tests green.
      1. ✅ BFS + bidirectional BFS on 2x2 (optimal; bidir expands fewer nodes)
      2. ✅ Beginner layer-by-layer 3x3 (labeled stages). *Honest scope:* cross + first layer
         by guided IDA*; middle+last layers finished by two-phase (no hand-coded OLL/PLL table).
      3. ✅ Thistlethwaite (nested-group descent: EO → domino reduction → domino solve;
         classic P3+P4 merged into one optimal domino solve).
      4. ✅ IDA* + corner PDB (88M) + edge-orientation, max-combo, move pruning, observable.
         *Roadmap:* full Korf two 6-edge PDBs (machinery present via `makeEdgeSubsetCoord`).
      5. ✅ Kociemba-style two-phase (own impl; atomic move tables + product-BFS pruning;
         avg ~23 moves, <1s build, fast solves).
      + ✅ admissibility verified vs BFS true distances at small depths.
- [x] **Phase 3 — Benchmark engine.** `cubelab-bench` CLI (JSON+CSV), honest depth caps,
      plots into `docs/benchmarks/`, `docs/BENCHMARK_ANALYSIS.md`. Commit.
- [x] **Phase 4 — Web app.** three.js 3D cube (view drag, face turn, keys), scramble/solve/
      reset, move-by-move playback + timeline, manual color painter w/ live validity,
      shareable URL encoding. Dark/light, responsive, a11y, web-worker solving and IndexedDB
      optimal-table cache. ✅ Core UI plus first lab views. Build and 43 tests pass.
- [x] **Phase 5 — Unique features.** Core features completed; optional timer remains out of scope.
      - [x] 1. Solver Race Mode (2–4 parallel workers, live search stats, winner).
      - [x] 2. Search Explorer (IDA* threshold and heuristic telemetry, sampled tree).
      - [x] 3. Heuristic Lab (toggle PDBs and compare nodes/time).
      - [x] 4. Smart Validity Doctor (plain-language validity checks and fixes).
      - [x] 5. Explainable Solution (named stages and reasons where supplied by solver).
      - [x] 6. Learn / Hint Mode.
      - [x] 7. Camera scanner (getUserMedia, Lab center calibration, confidence, upload/manual fixes); 2 classifier tests pass.
      - [x] 8. In-app benchmark dashboard.
      - [ ] 9. Optional timer / solve-then-compare.
- [x] **Phase 6 — Quality/polish.** Loading states, IndexedDB PDB cache, solver/WebGL/camera/JSON
      error states, lazy-loaded 3D viewer, onboarding, scanner tests under brightness/warm shifts,
      GitHub Actions build/test/type-lint + Pages deploy. Lighthouse desktop preview: performance
      65, accessibility 100; the performance limitation is documented.
- [x] **README.md**: screenshots, Mermaid architecture, algorithm summaries, measured benchmark
      table/plots, honest limitations, build/run, deployment, and “Why I built this”.
- [x] **Final summary** printed: built / how to run / missing / next steps.

## Working rules (from spec)
- Commit after every phase (Conventional Commits). Tests green before moving on.
- No external cube-solving library for solve logic. UI/math libs OK (record licenses).
- Never claim unmeasured results in the README.
- Infeasible → closest honest version + document under Limitations + continue.

## Premium UI redesign (in progress)

Goal: lift the web UI to a ~$400-grade product while keeping the dark-first, glass,
Linear/Raycast-restraint vibe and **all** behaviour. Vanilla TS + Vite + three.js + hand-written
CSS only. Art direction, audit and token spec live in `docs/redesign/` and `DESIGN.md`.

- [x] **Step 1 — Audit.** Screenshot every view @1440×900 + 390×844 (`docs/redesign/before/`),
      write `docs/redesign/AUDIT.md` (10 problems + preservation list). Repeatable capture:
      `node docs/redesign/capture.mjs <before|after> [theme] [views…]`.
- [ ] **Step 2 — Direction + DESIGN.md.** `docs/redesign/DIRECTIONS.md` (3 candidates, pick one);
      `DESIGN.md` single source of truth (palette, type, spacing, radius, elevation, motion,
      z-index, component rules).
- [x] **Step 3 — Tokens + shell.** Rebuilt `web/src/styles` tokens (Optical Bench: fonts, color,
      spacing, radius, elevation, motion, z-index) + shared styles; self-hosted Space Grotesk +
      JetBrains Mono; new top bar (brand mark, styled theme/palette toggles, keyboard-shortcut
      popover, `?`), segmented nav, consistent per-view page headers with instrument rails. Fixed
      the always-full progress-meter bug.
- [x] **Step 4 — Solve view.** Cube hero: three-point lighting (key/fill/rim + hemisphere), ACES
      tone mapping, rounded cubies, self-lit vivid stickers, CSS ground shadow, idle auto-drift
      (off under reduced-motion), aspect-correct renderer + capped stage. Floating STATE/READY HUD,
      polished playback bar (icon transport, scrubber, segmented speed), auto-scrolling move strip,
      icon action buttons, kbd-chip keyboard card, mobile bottom-sheet action bar.
- [x] **Step 5 — Other views.** All redesigned with empty / loading / error states.
      - [x] **Race** — solver identities (color dots + colored animated bars), ranks, winner banner.
      - [x] **Benchmarks** — stat tiles, metric-toggle grouped bar chart, semantic table, empty state.
      - [x] **Search Explorer** — live g/h/threshold/nodes readout tiles, legend, chart + frontier,
        empty / building / error states.
      - [x] **Heuristic Lab** — styled toggles, comparison cards with relative bars, loading + empty.
      - [x] **Validity Doctor** — ok/bad status panel with icon, styled fix list, re-check action.
      - [x] **Learn / hint** — hint panel, styled face-turn grid, reveal-next-move.
      - [x] **Scanner** — two-column layout, camera-off overlay, capture-progress dots, confidence
        legend, friendly permission-denied callout.
- [x] **Step 6 — Micro-interactions.** Hover/press/focus states and one eased curve across all
      controls, number tick-ups on benchmark stats, subtle staggered view/card entrances; all
      gated by `prefers-reduced-motion` (idle cube drift, animations, delays, smooth-scroll off).
- [~] **Step 7 — Visual QA loop.** Solve/Race/Benchmarks QA'd via Playwright earlier; remaining
      views (Explorer, Lab, Doctor, Learn, Scanner) + Step 6 are being reviewed in-browser by the
      user (this pass intentionally skipped the screenshot loop to save tokens).
- [~] **Step 8 — Wrap-up.** README updated with a Design section describing the Optical Bench
      direction (existing screenshot images left for the user to refresh); full `npm test` green
      (43 engine + 2 web); production build clean. Lighthouse re-run deferred (no-screenshot pass).
