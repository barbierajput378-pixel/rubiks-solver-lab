# Phase 0 — Research

Research done before writing any code. The goal: understand the correct algorithms
deeply enough to implement them *from scratch*, and study the best cubing/product UIs so
CubeLab feels like a finished product. **No code or assets were copied from any source.**
Only original code is used; third-party libraries are limited to UI/3D/math/build tooling
and their licenses are recorded in the README.

---

## A. Algorithms (correctness)

### Kociemba two-phase
Sources: [kociemba.org/math/twophase.htm](https://kociemba.org/math/twophase.htm),
[kociemba.org/moves20.htm](https://kociemba.org/moves20.htm),
[ruwix Cube Explorer](https://ruwix.com/the-rubiks-cube/herbert-kociemba-optimal-cube-solver-cube-explorer/).

- Two nested searches. **Phase 1** drives the cube into the subgroup
  `G1 = <U,D,L2,R2,F2,B2>` by making corner orientation, edge orientation, and the
  UD-slice-edge membership all trivial. It searches with all 18 moves.
- Phase 1 state is captured by three coordinates: **corner-orientation** (0..2186 = 3^7−1),
  **edge-orientation** (0..2047 = 2^11−1), and **UD-slice** (which 4 of 12 edge slots hold
  the E-slice edges, C(12,4)=495). Pruning tables over pairs of these coordinates give an
  admissible lower bound for an IDA*-style phase-1 search.
- **Phase 2** finishes inside `G1` using only `U,D,L2,R2,F2,B2` (10 moves). Its coordinates
  are corner permutation, the permutation of the 8 non-slice edges, and the permutation of
  the 4 slice edges.
- The trick that makes it *near-optimal* rather than just fast: don't stop at the first
  solution. For each phase-1 solution found, try shorter phase-2 completions, and keep
  iterating phase 1 to deeper lengths while tracking the best total. God's number is 20;
  this method reliably finds ≤20–22 quickly.

**What I take:** the coordinate decomposition and the two-phase structure.
**What I do differently:** I expose phase boundaries to the UI (the Explainable-Solution and
Search-Explorer features visualize exactly when the cube enters `G1`), and I ship my own
from-scratch coordinate math rather than any port of Cube Explorer.

### Thistlethwaite 4-phase
Source: [jaapsch.net/puzzles/thistle.htm](https://www.jaapsch.net/puzzles/thistle.htm).

- Nested groups, solved one quotient at a time:
  - `G0 = <U,D,L,R,F,B>` (all states, 4.33·10¹⁹)
  - `G1 = <U,D,L,R,F2,B2>` (edge orientation fixed) — 2.11·10¹⁶
  - `G2 = <U,D,L2,R2,F2,B2>` (corner orientation fixed + M-slice edges home) — 1.95·10¹⁰
  - `G3 = <U2,D2,L2,R2,F2,B2>` (pieces in correct orbits / even perms) — 6.63·10⁵
  - `G4 = {I}` — 1
- Each phase is a BFS/IDA* over a small coordinate with a precomputed transition table.
  Classic average ~52 moves; it's the first group-theoretic solver and a great teaching tool.

**What I take:** the group ladder and per-phase coordinates.
**What I do differently:** modern coordinate indexing + on-the-fly table generation (fast
enough in TS that no giant on-disk tables are needed), and each phase is *labeled and
explained* in the UI.

### Korf IDA* + pattern databases (optimal)
Sources: [Korf 1997 (Princeton PDF)](https://www.cs.princeton.edu/courses/archive/fall06/cos402/papers/korfrubik.pdf),
[Additive PDB heuristics, Felner et al.](https://arxiv.org/pdf/1107.0050).

- **IDA\*** with a lower-bound heuristic from **pattern databases**: exact solved-distance
  tables for *subsets* of cubies — one for the 8 corners, one for 6 edges, one for the other
  6 edges. Build each by a BFS backward from solved over the subset's coordinate.
- Corner PDB is admissible by itself; edge PDBs likewise. Because each quarter-turn moves 4
  corners and 4 edges, the databases **overlap**, so to stay admissible you take the
  **maximum** of the heuristics (not the sum). Median optimal solution is 18 moves.
- Essential speedups: **move pruning** (never undo the last move; canonical order for
  commuting opposite-face moves like U then D).

**What I take:** PDB-by-backward-BFS, max-combination, and move pruning.
**What I do differently:** PDBs are generated in a Web Worker with an IndexedDB cache (the
spec's WASM/disk cache analog for the browser), progress is streamed to a progress bar, and
the search is made *observable* (threshold, h vs g, pruned/expanded nodes) for the
Search-Explorer feature. **Honesty note:** optimal IDA\* on full-random 3×3 is not run in
benchmarks; realistic depth caps are used and documented (per spec §3).

### Smaller solvers
- **BFS / bidirectional BFS on 2×2**: fixing one corner leaves 3,674,160 reachable states —
  small enough for exact BFS and a clean demonstration of meet-in-the-middle halving depth.
- **Beginner layer-by-layer (3×3)**: not optimal, but every step is human-named (cross →
  first layer corners → second layer edges → OLL-ish → PLL-ish), which powers Learn/Hint Mode.

---

## B. Product / UI references

### Cubing tools
Sources: [ruwix programs list](https://ruwix.com/rubiks-cube-programs/),
twizzle.net, alg.cubing.net, cstimer.net.
- **cstimer** — the timer + visual scramble verification + stats UX is the gold standard for
  speedcubers. *Take:* a clean timer and scramble-preview idea (optional Phase 5.9).
- **Twizzle / alg.cubing.net** — algorithm viewer with move-by-move playback and shareable
  URLs. *Take:* URL-encoded scramble+solution, a scrubbe­able move timeline.
- *Do differently:* none of these show **solver internals** — CubeLab's Race Mode, Search
  Explorer, and Heuristic Lab visualize the *algorithms themselves*, which is the niche.

### Modern product UI (Linear / Vercel / Raycast / Stripe / Observable)
Source: [Linear-dark design-kit notes](https://cdn.jsdelivr.net/npm/@wrongstack/core@0.295.1/design-kits/linear-dark/KIT.md),
Raycast design write-ups.
- Deep near-black cool-tinted grounds, layered surfaces from tiny lightness steps, hairline
  `rgba(255,255,255,0.06–0.1)` borders, one restrained accent, crisp small Inter type, fast
  micro-interactions, multi-layer soft shadows for physical depth.
- Observable notebooks: charts are first-class, legible, and interactive.
- *Take:* a token-driven dark/light theme, soft-shadow glass cards, a single accent, D3/Chart
  visuals as first-class citizens. *Do differently:* colorblind-safe cube palette option and
  `prefers-reduced-motion` support baked in from the start (accessibility is a stated goal).

### Camera scanner
Sources: [qbr (HSV approach)](https://git.tdem.in/kkoomen/qbr),
[Color recognition for cube robot](https://ar5iv.labs.arxiv.org/html/1901.03470),
USPTO guided-restore patent (read for the *guided-face* UX idea only, not implementation).
- Standard pipeline: 3×3 ROI grid → average color per cell → classify against reference
  colors; HSV is more lighting-robust than RGB.
- *Take:* ROI sampling + a perceptual color space.
- *Do differently (the spec's twist):* **self-calibrate** using each face's **center sticker**
  as that color's live reference (centers are fixed on a 3×3), classify by nearest reference
  in a perceptual space, carry **per-sticker confidence**, flag low-confidence stickers for
  one-tap fix, and run the Validity Doctor after the scan to localize a likely misread. This
  adapts to lighting and non-standard color schemes — more robust than fixed HSV thresholds.

---

## C. Licensing stance
- All solving/cube logic: **original**, written from scratch for this repo (MIT).
- Allowed third-party deps (UI/3D/math/build only), licenses to be recorded in README:
  three.js (MIT), Vite (MIT), Vitest (MIT), TypeScript (Apache-2.0), and a charting lib
  (Chart.js MIT or D3 ISC). No external Rubik's-cube **solver** library is used.
