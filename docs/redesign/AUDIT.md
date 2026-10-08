# CubeLab redesign — visual & UX audit

Captured from the live dev server (`npm run dev`, http://localhost:5173) with Playwright +
SwiftShader at 1440×900 and 390×844, dark theme. Source shots live in
[`docs/redesign/before/`](./before/). Re-run any time with
`node docs/redesign/capture.mjs before`.

The app works and the engine is excellent. The problems below are all *presentation*: the UI
reads as a competent developer tool, not a $400 instrument. Nothing here requires touching
`engine/` or changing behaviour.

## The 10 biggest problems

### 1. Most views are a single small card floating in a black void
`before/race-desktop.png`, `before/explorer-desktop.png`, `before/lab`/`doctor`/`learn`.
On every view except Solve and Benchmarks, one narrow card sits top-left and **60–70% of the
viewport is empty black**. There is no layout system for a view — no page header, no supporting
panels, no composition. It reads as unfinished. This is the #1 thing that kills the premium feel.

### 2. The Solve progress meter renders permanently "full"
`before/solve-desktop.png` (the blue→green bar under the Solve button, at the "Ready" state).
`.meter > span` has no initial width, so a block span fills 100% of the track until JS sets a
width. The hero screen ships with what looks like a completed progress bar on an idle app — a
real rendering bug, and the first thing the eye lands on.

### 3. The 3D cube — the hero — is underwhelming
`before/solve-desktop.png`. Flat two-light setup, hard pure-black plastic body and seams, no
ground/contact shadow, no bloom/glow, no idle motion. It sits small and low in a large empty
stage with a faint radial wash. For the signature object of an "algorithm laboratory" it should
be the most alive, best-lit thing on screen; right now it looks like a default three.js demo.

### 4. Generic Inter typography, no tabular/mono discipline for data
`before/bench-desktop.png`, `before/solve-desktop.png`. Body font is Inter (the universal LLM
default). Stats, move counts and node counts are the point of this app, yet there is no
deliberate UI-sans + mono pairing and tabular figures are applied inconsistently. Numbers don't
line up as instrument readouts.

### 5. Benchmarks is a raw monospace data-dump
`before/bench-desktop.png`. ~30 identical mono rows with a hairline under each — the exact
"spec-sheet" anti-pattern. No column headers, no grouping by solver, no charts, no sorting, no
units in a header. The most data-rich screen has the least information design.

### 6. Charts are primitive and mostly invisible
`before/explorer-desktop.png`. The Search Explorer chart is an empty bordered black box with no
axes, gridlines, labels, or empty-state before a run; bars (when present) are bare rectangles
with no scale. Benchmarks has no charts at all. For a tool whose selling point is *visualising
search*, the dataviz is the weakest part.

### 7. Native, unstyled form controls
`before/race-desktop.png` (default checkboxes), `before/bench-desktop.png` &
`before/scanner-desktop.png` (grey "Choose File" OS buttons), selects everywhere. These break
the dark glass language instantly and look cheap next to the styled buttons.

### 8. No empty, loading, or populated-preview states
`before/race-desktop.png`, `before/explorer-desktop.png`, `before/scanner-desktop.png`. Race
shows nothing until you run it; Explorer shows an empty box; the scanner preview is a large pure
`#07090c` rectangle with a faint dashed guide and no confidence feedback. No skeletons, no
designed "getting started" states — so idle screens look broken rather than ready.

### 9. Weak brand identity and inconsistent iconography
`before/solve-desktop.png` header. The logo is a gradient tile with a `◈` glyph; actions use ad
hoc glyphs (`◐ Theme`, `◉ Palette`, `↗ Share link`) while a real SVG icon set (`ICONS` in
`ui/dom.ts`) sits unused. No signature visual motif ties screenshots together — it could be any
dark SaaS dashboard.

### 10. Uniform, flat glass cards with no depth hierarchy or texture
All shots. Every surface is the same single-layer translucent rectangle with the same radius,
border and shadow. No nested/instrument framing, no hairline rhythm, no tasteful grain, no sense
that primary surfaces sit above secondary ones. Depth is claimed (glass) but not built.

## Mobile-specific (390×844)

- **Header wraps:** `before/solve-mobile.png` — the Palette button drops to a second line below
  Theme, and the brand + two pill buttons compete for the top row. Needs a compact top bar.
- Tabs scroll horizontally (acceptable) but have no edge affordance.
- Solve stacks correctly, but controls are a long vertical scroll with no bottom-sheet grouping;
  the cube doesn't yet get a dedicated "hero on top" treatment.
- Scanner net tiles (`before/scanner-mobile.png`) are oversized full-width squares.

## What MUST be preserved (do not break)

- **All eight views + onboarding:** Solve, Solver race, Search explorer, Heuristic lab, Validity
  doctor, Learn/hint, Camera scanner, Benchmarks, and the first-run welcome card.
- **Themes:** dark (default) and light, toggled via `data-theme` and persisted in
  `localStorage["cubelab-theme"]`.
- **Colorblind palette:** `data-cb="on"` Okabe–Ito cube colors, persisted in
  `localStorage["cubelab-cb"]`; `CubeView.readThemeColors()` reads the six `--cube-*` vars.
- **Reduced motion:** `prefers-reduced-motion` path in CSS and in `CubeView` (idle/turn anims
  must stop).
- **Accessibility:** ARIA roles/labels (`role="tablist"`, `aria-selected`, `role="status"`,
  `aria-live`, progressbar, every control labelled), visible focus rings, Lighthouse a11y = 100.
- **Keyboard shortcuts:** `U D L R F B` turn faces, Shift inverts; `←/→` scrub playback.
- **Share-link URL hash:** `#s=<scramble>&a=<solution>` format in `updateHash()` and the initial
  parse — the exact format must stay stable.
- **Web-Worker solving** (`solver.worker.ts` via `solverClient.ts`) and **IndexedDB** PDB cache.
- **The six cube sticker colors stay the most vivid thing on screen** (both palettes).
- The `h()`/`toast()` DOM helpers, the `?view=` query param, and all solver wiring.

## The six cube colors (keep vivid — these anchor the palette)

Default: U `#f8f8f8` · R `#c8102e` · F `#009b48` · D `#ffd500` · L `#ff5800` · B `#0046ad`.
Colorblind: U `#ffffff` · R `#d55e00` · F `#009e73` · D `#f0e442` · L `#cc79a7` · B `#0072b2`.
