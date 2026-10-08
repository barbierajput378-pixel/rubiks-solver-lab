# CubeLab — Design System (`DESIGN.md`)

Single source of truth for the **Optical Bench** redesign. Direction rationale:
[`docs/redesign/DIRECTIONS.md`](docs/redesign/DIRECTIONS.md). Audit:
[`docs/redesign/AUDIT.md`](docs/redesign/AUDIT.md).

Language: a precision measurement instrument. Cool-graphite neutrals, one **phosphor-cyan**
accent, an engineering-grid substrate, hairline instrument rails, and mono telemetry readouts. The
six cube sticker colors stay the most saturated marks on every screen. Vanilla CSS custom
properties only — these token names map 1:1 to `web/src/styles/tokens.css`.

---

## 1. Color

### 1.1 Accent (one only — phosphor cyan)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--accent` | `#46d6c4` | `#0e9e8c` | focus rings, active state, links, live traces, meter fill, accent text |
| `--accent-strong` | `#2bbfad` | `#0b7d70` | primary-button gradient bottom, pressed |
| `--accent-soft` | `rgba(70,214,196,.14)` | `rgba(14,158,140,.12)` | tinted fills, active-tab glow, selection |
| `--accent-contrast` | `#042420` | `#ffffff` | text/icon on an accent fill |

Never introduce a second accent. Status hues below are semantic signals, not accents.

### 1.2 Cube sticker colors (the vivid anchors — keep saturated)
Default: `--cube-U #f8f8f8` · `--cube-R #c8102e` · `--cube-F #009b48` · `--cube-D #ffd500` ·
`--cube-L #ff5800` · `--cube-B #0046ad`.
Colorblind (`[data-cb="on"]`, Okabe–Ito): `U #ffffff` · `R #d55e00` · `F #009e73` · `D #f0e442` ·
`L #cc79a7` · `B #0072b2`. These are the only tokens `[data-cb]` changes.

### 1.3 Neutrals & surfaces (cool graphite, one gray family)
| Token | Dark | Light |
|---|---|---|
| `--bg` | `#090b0f` | `#f3f6f9` |
| `--bg-elev-1` | `#0e1218` | `#ffffff` |
| `--bg-elev-2` | `#141921` | `#ffffff` |
| `--bg-elev-3` | `#1a212b` | `#eceff4` |
| `--surface-glass` | `rgba(15,19,26,.72)` | `rgba(255,255,255,.80)` |
| `--surface-glass-strong` | `rgba(13,17,23,.88)` | `rgba(255,255,255,.90)` |
| `--text` | `#e8edf2` | `#0d1117` |
| `--text-dim` | `#9aa6b2` | `#495561` |
| `--text-faint` | `#636f7b` | `#808d99` |
| `--border` | `rgba(255,255,255,.07)` | `rgba(12,22,38,.10)` |
| `--border-strong` | `rgba(255,255,255,.13)` | `rgba(12,22,38,.17)` |
| `--grid-line` | `rgba(255,255,255,.035)` | `rgba(12,30,50,.045)` |
| `--grid-line-major` | `rgba(255,255,255,.06)` | `rgba(12,30,50,.07)` |

### 1.4 Status
`--ok #3ddc84` / `--warn #ffcf4a` / `--bad #ff6b6b` (dark). Light: `--ok #0f9d58`,
`--warn #b8860b`, `--bad #d33`. Each also has an `-soft` tint at ~14% for badge/row backgrounds.

### 1.5 Shadows (tinted cool, multi-layer)
```
--e1: 0 1px 2px rgba(3,6,10,.55);
--e2: 0 1px 2px rgba(3,6,10,.45), 0 10px 28px rgba(3,6,10,.42);
--e3: 0 2px 6px rgba(3,6,10,.5), 0 22px 54px rgba(3,6,10,.55);
--inset-hi: inset 0 1px 0 rgba(255,255,255,.06);          /* light: rgba(255,255,255,.7) */
--glow-accent: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent),
               0 0 22px -6px color-mix(in srgb, var(--accent) 55%, transparent);
```
Light theme shadows use `rgba(16,32,56,.08–.16)`.

---

## 2. Typography

- `--font-sans: "Space Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`
- `--font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;`
- Self-hosted woff2 in `web/public/fonts/`, `@font-face` with `font-display: swap`. No `<link>`.
- **Mono is for data:** move notation, node/ms/depth readouts, every table figure, stat values.
  `font-variant-numeric: tabular-nums` on all number-bearing text (Space Grotesk digits are already
  fixed-width; declare it anyway).

### Scale (px; use `rem` in code where sensible)
| Token | Size / line-height / weight / tracking | Role |
|---|---|---|
| `--fs-display` | `clamp(26px,3.2vw,34px)` / 1.08 / 600 / -0.02em | hero / big specimen titles (rare) |
| `--fs-h1` | 21px / 1.15 / 600 / -0.015em | page-header title |
| `--fs-h2` | 15px / 1.25 / 600 / -0.01em | panel/card title |
| `--fs-body` | 13.5px / 1.5 / 450 / 0 | body, controls |
| `--fs-sm` | 12.5px / 1.45 / 450 | secondary / `.subtle` |
| `--fs-micro` | 11px / 1.3 / 600 / 0.14em UPPERCASE | eyebrow / rail label / stat key |
| `--fs-stat` | 22px / 1.1 / 600 tabular mono | instrument readouts; `--fs-stat-lg` 30px |

Headings sentence case. Eyebrows UPPERCASE mono/sans with wide tracking, used sparingly (one per
page header + section rails, not on every element). Body max width ~68ch for prose.

---

## 3. Spacing (4px base)
`--space-2 2` · `--space-xs 4` · `--space-sm 8` · `--space-md 12` · `--space-lg 16` ·
`--space-xl 24` · `--space-2xl 32` · `--space-3xl 48` · `--space-4xl 64`.
Panel padding `--space-xl` (24) desktop / `--space-lg` (16) mobile. Section gap `--space-xl`.
Optical asymmetry allowed: bottom padding of a section may exceed top by one step.

## 4. Radius
`--r-xs 6` · `--r-sm 9` · `--r-md 12` · `--r-lg 16` · `--r-xl 22` · `--r-pill 999`.
Rule: **concentric** — inner element radius = outer − its padding. Panels `--r-lg`, inner insets
`--r-md`, chips/inputs `--r-sm`, pills/toggles `--r-pill`. One scale everywhere.

## 5. Elevation ladder
0 page (grid substrate) → 1 panel (`--bg-elev-1` + `--border` + `--e2` + `--inset-hi`) → 2 raised
control/stat (`--bg-elev-2`) → 3 popover/tooltip/toast (`--surface-glass-strong` + `--e3`). Glass
(`backdrop-filter: blur(14px) saturate(140%)`) only on fixed/sticky chrome (top bar, tooltips,
toasts, bottom sheet) — never on scrolling content (perf). Solid-fill fallback under
`prefers-reduced-transparency`.

## 6. Motion
- One curve: `--ease: cubic-bezier(.32,.72,0,1)`.
- Durations: `--dur-1 120ms` (hover/press), `--dur-2 200ms` (state/color), `--dur-3 320ms`
  (panel/view), `--dur-entrance 560ms`.
- Hover: `translateY(-1px)` + subtle brightness/border lift. Press: `translateY(0) scale(.985)`.
- Focus-visible: `outline: 2px solid var(--accent); outline-offset: 2px;` plus `--glow-accent` on
  key controls. Always visible, never removed.
- Entrance: `opacity 0→1, translateY(8px)→0`, `--dur-entrance`, stagger 40ms via `Intersection
  Observer` / nth-child delay. Number tick-ups via `requestAnimationFrame`.
- Animate only `transform`/`opacity`. **`prefers-reduced-motion`**: durations→0.01ms, no
  entrances, no tick-ups, no cube idle drift.

## 7. z-index scale
`--z-base 0` · `--z-rail 1` · `--z-sticky 50` · `--z-dropdown 100` · `--z-tooltip 200` ·
`--z-toast 300` · `--z-modal 400`. No arbitrary values.

## 8. Signature primitives
- **Grid substrate** (`body::before`, fixed, `pointer-events:none`): layered linear-gradients —
  minor grid every 28px in `--grid-line`, major every 112px in `--grid-line-major` — over the page
  bg, plus a soft radial **phosphor key glow** top-right (`--accent` ~10%) and a cube-green wash
  bottom-left (~7%). Subtle; the grid should read only on large flat areas.
- **Instrument rails:** section/page headers and the cube stage carry an `::after` hairline rule
  and small L-shaped **corner ticks** (8px, `--border-strong`) at two corners. Used on headers and
  the specimen stage only — not on every card.
- **Double-bezel panels:** hairline `--border` + `--inset-hi` so each panel reads as a plate set
  into a tray.
- **Mono readouts:** stat values and telemetry in `--font-mono`, tabular, with a `--fs-micro`
  uppercase key above.

---

## 9. Component rules

**Top bar (`.topbar`)** — sticky, glass, height 56–60px, hairline bottom border. Left: brand mark
(a 3×3 micro-grid glyph in a plate, cube-tinted) + wordmark `CubeLab` with mono eyebrow
`ALGORITHM LAB`. Right: icon+label **Theme** and **Palette** toggles (styled, SVG icons from
`ICONS`, not glyphs) and a keyboard-shortcut hint (`?` opens a shortcuts popover). On mobile the
label text collapses to icons so the bar stays one line.

**Navigation (`.tabs`)** — a segmented control in a raised inset track: pill indicator on the
active tab (`--bg-elev-3` + `--inset-hi` + hairline), dim→bright label on hover, `--accent` left
tick on the active item. Horizontally scrollable on mobile with a fade mask at the right edge.
Active = `aria-selected` (unchanged).

**Page header** — every view opens with a header block (not buried in a card): mono eyebrow (e.g.
`03 · SEARCH EXPLORER`), `--fs-h1` title, one-line `--text-dim` description, optional right-aligned
status/primary action. Carries the instrument rail + corner ticks. This fixes the "card in a void"
problem by giving each view structure above the panels.

**Glass card / panel (`.card`, `.panel`)** — `--bg-elev-1`, `--border`, `--r-lg`, `--e2`,
`--inset-hi`, padding `--space-xl`. Title `--fs-h2`, optional `.subtle` description `--fs-sm`.
Cards exist only where elevation means hierarchy; otherwise group with hairline dividers / rails.

**Buttons (`.btn`)** — `--r-sm`, padding `9px 14px`, `--fs-body` weight 550, `--bg-elev-2` +
`--border-strong` + `--inset-hi`; hover lifts `-1px` + border brightens; `:active`
`scale(.985)`. `.primary`: gradient `--accent → --accent-strong`, `--accent-contrast` text, subtle
`--glow-accent`. `.ghost`: transparent + `--border`. `.icon`: square. Disabled: 0.45 opacity, no
transform. Trailing action icon (e.g. share ↗) sits in its own inset circle (button-in-button).
Primary label ≤3 words; contrast AA verified.

**Segmented control** — same track/pill language as tabs; for solver/speed/mode choices. Reuse for
Race solver pickers and any 2–4 option switch.

**Slider (`input[type=range]`)** — custom: 4px track in `--bg-elev-3`, filled portion `--accent`,
thumb 14px disc `--bg-elev-1` with `--border-strong` + `--e1`, grows + `--glow-accent` on
focus/active. Min hit target 28px. Used by playback scrubber + speed.

**Move chip (`.move-chip`)** — mono, `--r-sm`, `--bg-elev-2` + `--border`, `--text-dim`. `.done` =
full `--text`. `.current` = `--accent` fill, `--accent-contrast` text, `--glow-accent`, scale 1.06.
Hover raises. Chips wrap; current chip auto-scrolls into view.

**Playback bar** — one grouped control cluster: prev / play-pause / next (icon buttons), scrubber
(slider) with `cursor/total` mono counter, speed segmented control. Current move mirrored in both
the chip row and the stage. Sticky within the panel.

**Tabs** — see Navigation.

**Tooltip** — `--surface-glass-strong`, `--e3`, `--r-sm`, `--fs-sm`, 6–8px padding, 1px border,
arrow optional; fade+translate 4px in `--dur-2`; `z: --z-tooltip`. Used for chart points and icon
buttons. Keyboard-focus reachable (`aria-describedby`).

**Toast (`.toast`)** — bottom-center stack, `--surface-glass-strong`, `--e3`, `--r-md`, left
`--accent`/status tick, slide-up+fade in `--dur-3`, auto-dismiss. `z: --z-toast`. No `!` in copy.

**Empty state** — centered composed block: a faint instrument glyph (grid/scope), `--fs-h2` line
("Run a search to stream telemetry"), one `--text-dim` hint, and the primary action. Fills the
panel so idle views never look broken. Every runnable view has one.

**Skeleton loader** — shape-matched blocks in `--bg-elev-2` with a reduced-motion-safe shimmer
(`--accent-soft` sweep via `transform`). Used for bench rows, race rows, chart area while workers
build.

**Chart style (shared `.chart`)** — dark plot area on `--bg-elev-1`; axes as hairline
`--border-strong` with mono `--fs-micro` tick labels; soft gridlines `--grid-line`; series use
`--accent` for the primary trace (g/live) and a **fixed per-solver color map** elsewhere; data
points get a hover tooltip; prefer direct end-of-line labels over legends. Bars/areas animate height
via `transform: scaleY` from the baseline.

**Solver color map** (`--solver-*`, stable across Race, Explorer, Bench; chart-series only, kept
lower-saturation than the cube stickers, no purple):
Kociemba = `--accent` cyan `#46d6c4` · Thistlethwaite amber `#e8b04b` · Beginner lime `#8bd450` ·
IDA* steel blue `#6ea8fe` · BFS (2×2) coral `#ff8f6b` · Bidirectional BFS rose `#e06c9f`.

**Progress bar / meter (`.meter`)** — 6px track `--bg-elev-3` inset, fill `--accent`
→`--accent-strong` gradient with a faint moving sheen while active; **width 0 at rest** (fixes the
"always full" bug — the fill element starts at `width:0`/`transform:scaleX(0)`); `role=progressbar`
with `aria-valuenow`. Indeterminate (worker building) = looping sheen, no false percentage.

---

## 10. Accessibility & preservation (non-negotiable)
Keep: dark/light + colorblind palettes, `prefers-reduced-motion`, all ARIA roles/labels, visible
focus rings, keyboard shortcuts (`U D L R F B`, Shift, `←/→`), share-link hash `#s=…&a=…`, Web
Worker solving, IndexedDB cache, `?view=` param. Lighthouse a11y must stay **100**; every new color
pair meets WCAG AA (4.5:1 text, 3:1 large/UI). Contrast of `--text-dim` on `--bg-elev-1` verified
AA in both themes.
