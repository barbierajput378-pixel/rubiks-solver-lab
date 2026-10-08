# Art direction — candidates & decision

Brief: make CubeLab feel like a ~$400 instrument for an *algorithm laboratory*, dark-first, glass,
Linear/Raycast restraint, **not** a generic AI SaaS dashboard. One accent + restrained neutrals;
the six cube sticker colors stay the most vivid thing on screen; deliberate UI-sans + mono pairing
with tabular numbers; real layered depth and motion.

Hard constraint recap: vanilla TS + Vite + three.js + hand-written CSS tokens. No framework.

## Candidate A — "Optical Bench" ✅ CHOSEN

- **Mood:** a precision measurement rig — oscilloscope screen, optical bench, specimen under a
  calibrated lamp. The app is an *instrument*, not a webpage. Calm, exact, a little scientific.
- **Signature visual idea:** a faint engineering-grid substrate (graph-paper lines + a brighter
  minor/major rhythm) behind the whole app, and **corner tick-marks / hairline rails** that frame
  every panel like a measurement readout. The 3D cube sits on a lit *specimen stage* with a
  contact shadow and a soft key glow. Telemetry (nodes, depth, ms, move notation) is rendered as
  mono instrument readouts with tabular figures. Screenshots are instantly recognizable by the
  grid + rails + readouts.
- **Accent:** a single **signal cyan / phosphor** (oscilloscope trace). Distinct from all six cube
  colors and nothing like AI-purple. Used only for focus, primary action, active state, live
  traces and meters — so the saturated cube stickers still dominate.
- **Neutrals:** cool graphite near-blacks (one gray family, slightly blue-cool), hairline borders.
- **Type:** **Space Grotesk** (technical grotesk; brand, headings, labels, big stat values — its
  numerals are fixed-width, perfect for an instrument) + **JetBrains Mono** (move notation,
  telemetry, table figures). Two families, both OFL, self-hosted woff2.
- **Why it fits:** "algorithm laboratory" taken literally — this is a tool about *searching and
  measuring*. The grid/rails/readout language makes the data the hero and the cube the specimen,
  which is exactly what the app does. Restrained enough to stay Linear-tier; specific enough to
  never read as a template.

## Candidate B — "Cyanotype Blueprint"

- **Mood:** architectural blueprint / drafting table — construction lines, annotations, cyanotype
  blue paper.
- **Signature:** blueprint-blue grid, dimension lines and callout leaders around components; cube
  drawn like an exploded technical diagram.
- **Accent:** blueprint blue.
- **Why not:** the accent blue collides with the cube **B** face (`#0046ad`) and with the "AI blue
  glow" cliché the taste skills warn against; a blue-on-blue page also fights the cube's own blue
  sticker for vividness. Strong motif, wrong accent for *this* palette.

## Candidate C — "Swiss Lab Report"

- **Mood:** an editorial scientific journal — strict typographic grid, numbered figures, figure
  captions, generous margins.
- **Signature:** `Fig. 03` caption lines, section numbering, big editorial stat blocks, hairline
  dividers; a single editorial red accent.
- **Why not:** an editorial red/orange accent collides with the cube **R**/**L** faces, and a
  paper-editorial language pulls toward light/airy layouts — at odds with the required dark-first,
  interactive, telemetry-dense product. Beautiful for a static write-up, weaker for a live
  instrument with a 3D hero and streaming charts.

## Decision

**Candidate A — "Optical Bench."** It is the only candidate whose signature motif (grid + rails +
mono readouts + lit specimen stage) directly dramatizes what CubeLab *does* — run and measure
search — while its cool-graphite + single phosphor-cyan palette leaves the six saturated cube
colors as the brightest marks on every screen, and keeps clear of both the AI-purple/blue and the
cube's own hues. It stays within Linear/Raycast restraint but is unmistakable in a screenshot.

Full tokens and component rules: [`/DESIGN.md`](../../DESIGN.md).
