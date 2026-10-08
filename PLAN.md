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
- [ ] **Phase 1 — Cube model + tests.** Cubie model (8 corners/12 edges, perm+orient),
      18 move tables, compose/invert, `docs/CONVENTIONS.md`, structured validity checker,
      seeded uniform-random valid-state generator. Full Vitest suite. Commit.
- [ ] **Phase 2 — Solvers** (each behind `Solver`, each reporting nodes/time/memory/length,
      with timeout + cancel):
      1. BFS + bidirectional BFS on 2x2
      2. Beginner layer-by-layer 3x3 (labeled steps)
      3. Thistlethwaite 4-phase
      4. IDA* + Korf-style PDBs (corner + two 6-edge, max-combo), move pruning
      5. Kociemba-style two-phase (own implementation)
      + admissibility check vs BFS true distances. Tests. Commit.
- [ ] **Phase 3 — Benchmark engine.** `cubelab-bench` CLI (JSON+CSV), honest depth caps,
      plots into `docs/benchmarks/`, `docs/BENCHMARK_ANALYSIS.md`. Commit.
- [ ] **Phase 4 — Web app.** three.js 3D cube (view drag, face turn, keys), scramble/solve/
      reset, move-by-move playback + timeline, manual color painter w/ live validity,
      shareable URL encoding. Dark/light, responsive, a11y. Commit.
- [ ] **Phase 5 — Unique features.** Race Mode, Search Explorer, Heuristic Lab, Validity
      Doctor, Explainable Solution, Learn/Hint Mode, camera scanner (getUserMedia + HSV/Lab
      + calibration + confidence + fallbacks), in-app benchmark dashboard. Commit.
- [ ] **Phase 6 — Quality/polish.** Loading states, IndexedDB PDB cache, error states,
      lazy-loading, micro-interactions, onboarding, scanner classifier tests, GitHub
      Actions CI + Pages deploy. Commit.
- [ ] **README.md** (last): pitch, screenshots, Mermaid architecture, algorithm summaries,
      real benchmark table/plots, honest limitations, build/run, roadmap, credits, "why".
- [ ] **Final summary** printed: built / how to run / missing / next steps.

## Working rules (from spec)
- Commit after every phase (Conventional Commits). Tests green before moving on.
- No external cube-solving library for solve logic. UI/math libs OK (record licenses).
- Never claim unmeasured results in the README.
- Infeasible → closest honest version + document under Limitations + continue.
