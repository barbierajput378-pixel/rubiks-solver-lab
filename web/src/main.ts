import "./styles/app.css";
import {
  Face, FACE_NAMES, MOVES, SOLVED_FACELETS, applyMoveIndex,
  cubieToFacelet, randomScramble, uniformRandomState, solvedCube, validateFacelets,
} from "@cubelab/engine";
import type { CubieCube, FaceletCube, SolveStage, SolverProgress } from "@cubelab/engine";
import type { CubeView } from "./cube3d/CubeView";
import { runSolve } from "./engine/solverClient";
import type { RunningSolve } from "./engine/solverClient";
import { buildScanner } from "./scanner/scanner";
import benchmarkData from "../../bench-out/results.json";
import { h, toast, icon, ICONS } from "./ui/dom";

const root = document.querySelector<HTMLElement>("#app")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const savedTheme = localStorage.getItem("cubelab-theme") ?? "dark";
document.documentElement.dataset.theme = savedTheme;
document.documentElement.dataset.cb = localStorage.getItem("cubelab-cb") ?? "off";

let cube: CubieCube = solvedCube();
let startCube: CubieCube = solvedCube();
let solution: number[] = [];
let solutionStages: SolveStage[] = [];
let cursor = 0;
let learnStep = 0;
let learnHint: HTMLElement | undefined;
let activeJob: ReturnType<typeof runSolve> | undefined;
let currentView: CubeView | undefined;
const raceJobs: RunningSolve[] = [];
const raceTimers: number[] = [];
const SOLVER_OPTIONS = [
  { id: "kociemba", name: "Kociemba two-phase" }, { id: "thistlethwaite", name: "Thistlethwaite" },
  { id: "beginner", name: "Beginner hybrid" }, { id: "ida-pdb", name: "IDA* + pattern DB (optimal)" },
  { id: "bibfs-2x2", name: "Bidirectional BFS (2×2)" }, { id: "bfs-2x2", name: "BFS (2×2)" },
];
let progressText = "Ready";
let painterColors: FaceletCube = SOLVED_FACELETS.slice();
let activeTab = new URLSearchParams(location.search).get("view") ?? "solve";
if (!["solve", "race", "explorer", "lab", "doctor", "learn", "scanner", "bench"].includes(activeTab)) activeTab = "solve";
const settings = { solver: "kociemba", speed: 1 };

const setCube = (next: CubieCube) => {
  cube = next;
  currentView?.setCube(cube);
  updateHash();
};
const updateHash = () => {
  const scrambleAlg = window.sessionStorage.getItem("cubelab-scramble") ?? "";
  const sol = solution.length ? MOVES.map((m) => m.name) && solution.map((i) => MOVES[i]!.name).join(" ") : "";
  history.replaceState(null, "", `#s=${encodeURIComponent(scrambleAlg)}&a=${encodeURIComponent(sol)}`);
};
const shell = h("div", { class: "app-shell" });
root.append(shell);
const header = h("header", { class: "topbar" });
const brand = h("a", { class: "brand", href: "?view=solve", "aria-label": "CubeLab home" }, [
  h("span", { class: "logo", "aria-hidden": "true" }, [icon(ICONS.grid, 20)]),
  h("span", { class: "wordmark" }, ["CubeLab", h("small", {}, ["Algorithm Lab"])]),
]);
brand.onclick = (e) => { e.preventDefault(); activeTab = "solve"; render(); };
header.append(brand, h("div", { class: "spacer" }));

const labelBtn = (ico: string, label: string, aria: string) =>
  h("button", { class: "btn ghost", type: "button", "aria-label": aria }, [icon(ico), h("span", { class: "label-text" }, [label])]);

// keyboard-shortcut hint + popover
const shortcutsPanel = h("div", { class: "shortcuts hidden", role: "dialog", "aria-label": "Keyboard shortcuts" }, [
  h("h3", {}, ["Keyboard shortcuts"]),
  h("dl", {}, [
    h("dt", {}, [h("kbd", {}, ["U"]), h("kbd", {}, ["D"]), h("kbd", {}, ["L"]), h("kbd", {}, ["R"]), h("kbd", {}, ["F"]), h("kbd", {}, ["B"])]), h("dd", {}, ["Turn a face clockwise"]),
    h("dt", {}, [h("kbd", {}, ["Shift"]), h("span", { class: "plus" }, ["+"]), h("kbd", {}, ["face"])]), h("dd", {}, ["Turn counter-clockwise"]),
    h("dt", {}, [h("kbd", {}, ["←"]), h("kbd", {}, ["→"])]), h("dd", {}, ["Step through the solution"]),
    h("dt", {}, [h("kbd", {}, ["?"])]), h("dd", {}, ["Toggle this panel"]),
  ]),
]);
const helpButton = h("button", { class: "btn ghost icon", type: "button", "aria-label": "Keyboard shortcuts", "aria-expanded": "false" }, [icon(ICONS.keyboard)]);
const toggleShortcuts = (force?: boolean) => {
  const show = force ?? shortcutsPanel.classList.contains("hidden");
  shortcutsPanel.classList.toggle("hidden", !show);
  helpButton.setAttribute("aria-expanded", String(show));
};
helpButton.onclick = () => toggleShortcuts();

const themeIcon = () => (document.documentElement.dataset.theme === "dark" ? ICONS.moon : ICONS.sun);
const themeButton = labelBtn(themeIcon(), "Theme", "Toggle light and dark theme");
themeButton.onclick = () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme; localStorage.setItem("cubelab-theme", theme);
  themeButton.replaceChildren(icon(themeIcon()), h("span", { class: "label-text" }, ["Theme"]));
  currentView?.readThemeColors();
};
const cbButton = labelBtn(ICONS.palette, "Palette", "Toggle colorblind-safe cube palette");
cbButton.setAttribute("aria-pressed", String(document.documentElement.dataset.cb === "on"));
cbButton.onclick = () => {
  const cb = document.documentElement.dataset.cb === "on" ? "off" : "on";
  document.documentElement.dataset.cb = cb; localStorage.setItem("cubelab-cb", cb);
  cbButton.setAttribute("aria-pressed", String(cb === "on"));
  currentView?.readThemeColors();
};
header.append(helpButton, themeButton, cbButton, shortcutsPanel);
shell.append(header);

const tabs = h("nav", { class: "tabs", role: "tablist", "aria-label": "CubeLab sections" });
const tabNames = [["solve", "Solve"], ["race", "Solver race"], ["explorer", "Search explorer"], ["lab", "Heuristic lab"], ["doctor", "Validity doctor"], ["learn", "Learn / hint"], ["scanner", "Camera scanner"], ["bench", "Benchmarks"]] as const;
const content = h("main", { id: "main-content", tabindex: "-1" });
for (const [id, label] of tabNames) {
  const b = h("button", { class: "tab", role: "tab", "aria-selected": id === activeTab, "aria-controls": "main-content" }, [label]);
  b.onclick = () => { activeTab = id; render(); };
  tabs.append(b);
}
shell.append(tabs, content);

function button(label: string, fn: () => void, primary = false, aria = label) {
  const b = h("button", { class: `btn${primary ? " primary" : ""}`, type: "button", "aria-label": aria }, [label]);
  b.onclick = fn;
  return b;
}
function card(title: string, subtitle?: string) {
  const c = h("section", { class: "card" });
  c.append(h("h2", {}, [title]));
  if (subtitle) c.append(h("p", { class: "subtle" }, [subtitle]));
  return c;
}
// Per-view identity for the consistent page header (eyebrow index + title + lead).
const VIEW_META: Record<string, { idx: string; title: string; lead: string }> = {
  solve: { idx: "01", title: "Solve", lead: "Scramble or paint a cube, pick a solver, then inspect the returned algorithm move by move." },
  race: { idx: "02", title: "Solver race", lead: "Run 2–4 solvers at once in isolated workers and watch the search unfold. First correct completion wins." },
  explorer: { idx: "03", title: "Search explorer", lead: "Stream IDA* thresholds and heuristic telemetry live from the optimal-search worker." },
  lab: { idx: "04", title: "Heuristic lab", lead: "Toggle admissible pattern databases and compare their effect on search cost for one scramble." },
  doctor: { idx: "05", title: "Validity doctor", lead: "Check painted stickers against color counts, piece inventory, orientation and parity — with repairs." },
  learn: { idx: "06", title: "Learn / hint", lead: "Reveal the solution one move at a time, with an explanation from each named solver stage." },
  scanner: { idx: "07", title: "Camera scanner", lead: "Capture each face with your camera or a photo; centers self-calibrate color under your lighting." },
  bench: { idx: "08", title: "Benchmarks", lead: "Measured solver performance across scramble depths. Values are machine-dependent." },
};
function statTile(label: string, value: HTMLElement) {
  return h("div", { class: "stat" }, [h("div", { class: "k" }, [label]), value]);
}
// Animate a number counting up to `to`; instant under reduced motion.
function tickUp(el: HTMLElement, to: number, format: (n: number) => string = (n) => Math.round(n).toLocaleString(), ms = 620) {
  if (reducedMotion || to === 0) { el.textContent = format(to); return; }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(to * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function legendItem(color: string, label: string) {
  return h("span", { class: "legend-item" }, [h("span", { class: "dot", style: `--row-accent:${color}`, "aria-hidden": "true" }), label]);
}
function emptyState(ico: string, title: string, body: string, extra?: HTMLElement) {
  const el = h("div", { class: "empty" }, [
    h("div", { class: "glyph" }, [icon(ico, 22)]),
    h("h3", {}, [title]),
    h("p", {}, [body]),
  ]);
  if (extra) el.append(extra);
  return el;
}
function pageHeader(id: string, actions?: HTMLElement) {
  const m = VIEW_META[id]!;
  const head = h("div", { class: "page-head" });
  const main = h("div", { class: "head-main" }, [
    h("p", { class: "eyebrow" }, [h("span", { class: "idx" }, [m.idx]), " · ", m.title.toUpperCase()]),
    h("h1", {}, [m.title]),
    h("p", { class: "lead" }, [m.lead]),
  ]);
  head.append(main);
  if (actions) head.append(h("div", { class: "head-actions" }, [actions]));
  return head;
}
function commitTurn(face: Face, power: 1 | 2 | 3) {
  if (currentView?.isAnimating) return;
  const idx = MOVES.findIndex((m) => m.face === face && m.power === power);
  if (idx >= 0) {
    const expected = solution[learnStep];
    if (currentView) void currentView.turn(face, power, true);
    cube = applyMoveIndex(cube, idx);
    if (activeTab === "learn") {
      if (expected === idx) { learnStep++; if (learnHint) learnHint.textContent = learnStep >= solution.length ? "Correct move. Cube solved!" : "Correct move. Ask for the next hint when ready."; }
      else if (learnHint) learnHint.textContent = "That move does not match the expected move. You can undo it with the inverse key.";
    } else { solution = []; solutionStages = []; cursor = 0; }
    updateHash(); renderPlayback();
  }
}
function solveNow() {
  activeJob?.cancel();
  startCube = cube; solution = []; solutionStages = []; cursor = 0;
  const meter = document.querySelector<HTMLElement>("#solve-meter span");
  const status = document.querySelector<HTMLElement>("#solve-status");
  if (status) status.textContent = "Starting worker…";
  if (meter) meter.style.width = "8%";
  activeJob = runSolve(settings.solver, cube, { timeoutMs: 30000, progressInterval: 25000 }, {
    onBuilding: (name) => { progressText = `Building ${name}…`; if (status) status.textContent = progressText; if (meter) meter.style.width = "22%"; },
    onProgress: (p: SolverProgress) => { progressText = `${p.phase ?? "Searching"} · ${p.nodesExpanded.toLocaleString()} nodes${p.threshold == null ? "" : ` · threshold ${p.threshold}`}`; if (status) status.textContent = progressText; if (meter) meter.style.width = `${Math.min(92, 25 + Math.log10(p.nodesExpanded + 1) * 12)}%`; },
  });
  activeJob.promise.then((result) => {
    activeJob = undefined;
    if (!result.solved) { if (status) status.textContent = result.timedOut ? "Time limit reached. Try another solver." : "No solution returned."; if (meter) meter.style.width = "0"; return; }
    solution = result.solution.slice(); solutionStages = result.stages ?? []; cursor = 0; learnStep = 0; progressText = `${result.solution.length} moves · ${result.stats.timeMs.toFixed(1)} ms`;
    if (status) status.textContent = progressText; if (meter) meter.style.width = "100%";
    window.setTimeout(() => { if (meter) meter.style.width = "0"; }, 800);
    updateHash(); renderPlayback();
  }).catch((err: Error) => { activeJob = undefined; if (status) status.textContent = `Solver error: ${err.message}`; if (meter) meter.style.width = "0"; });
}
function renderPlayback() {
  const moves = document.querySelector<HTMLElement>("#move-list");
  const label = document.querySelector<HTMLElement>("#playback-status");
  const stages = document.querySelector<HTMLElement>("#solution-stages");
  if (!moves) return;
  moves.replaceChildren(...solution.map((idx, i) => h("button", { class: `move-chip${i === cursor ? " current" : i < cursor ? " done" : ""}`, "aria-label": `Move ${i + 1}: ${MOVES[idx]!.name}` }, [MOVES[idx]!.name])));
  [...moves.children].forEach((e, i) => { e.addEventListener("click", () => seek(i)); });
  const current = moves.querySelector<HTMLElement>(".move-chip.current");
  if (current) moves.scrollTo({ left: current.offsetLeft - moves.clientWidth / 2 + current.offsetWidth / 2, behavior: reducedMotion ? "auto" : "smooth" });
  const slider = document.querySelector<HTMLInputElement>("#playback-range");
  if (slider) { slider.max = String(solution.length); slider.value = String(cursor); slider.setAttribute("aria-valuenow", String(cursor)); }
  if (label) label.textContent = `${cursor} / ${solution.length}`;
  const hud = document.querySelector<HTMLElement>("#stage-hud-v");
  if (hud) hud.textContent = !solution.length ? (window.sessionStorage.getItem("cubelab-scramble") ? "SCRAMBLED" : "READY") : cursor >= solution.length ? "SOLVED" : MOVES[solution[cursor]!]!.name;
  if (stages) { let offset = 0; stages.replaceChildren(...solutionStages.map((s, i) => { const begin = offset; offset += s.moves.length; const active = cursor >= begin && (cursor < offset || (i === solutionStages.length - 1 && cursor === solution.length)); return h("div", { class: `stage-note${active ? " active" : ""}` }, [h("strong", {}, [s.label]), h("span", {}, [s.explanation])]); })); }
}
function seek(n: number) {
  cursor = Math.max(0, Math.min(solution.length, n));
  let c = { cp: startCube.cp.slice(), co: startCube.co.slice(), ep: startCube.ep.slice(), eo: startCube.eo.slice() };
  for (let i = 0; i < cursor; i++) c = applyMoveIndex(c, solution[i]!);
  cube = c; currentView?.setCube(cube); renderPlayback();
}
function scrambleCube() {
  const sc = randomScramble(20, Math.floor(Math.random() * 0xffffffff));
  const next = sc.cube; startCube = next; solution = []; solutionStages = []; cursor = 0;
  painterColors = cubieToFacelet(next); setCube(next);
  window.sessionStorage.setItem("cubelab-scramble", sc.alg); progressText = `Scramble: ${sc.alg}`; render();
}
function resetCube() {
  activeJob?.cancel(); activeJob = undefined; solution = []; solutionStages = []; cursor = 0;
  startCube = solvedCube(); painterColors = SOLVED_FACELETS.slice(); setCube(solvedCube());
  window.sessionStorage.removeItem("cubelab-scramble"); render();
}
function shareLink() {
  updateHash();
  void navigator.clipboard?.writeText(location.href).then(() => toast("Share link copied")).catch(() => toast("Copy the link from the address bar"));
}
const iconBtn = (ico: string, aria: string, fn: () => void, cls = "btn ghost icon") => {
  const b = h("button", { class: cls, type: "button", "aria-label": aria }, [icon(ico)]);
  b.onclick = fn; return b;
};
const labelIconBtn = (ico: string, label: string, fn: () => void, primary = false) => {
  const b = h("button", { class: `btn${primary ? " primary" : ""}`, type: "button", "aria-label": label }, [icon(ico), h("span", {}, [label])]);
  b.onclick = fn; return b;
};
function setPlayIcon(btn: HTMLElement) { btn.replaceChildren(icon(playTimer ? ICONS.pause : ICONS.play)); }
function buildSolveView() {
  const layout = h("div", { class: "layout solve-layout" });

  // ---- hero: the cube as a lit specimen ----
  const left = h("div", { class: "stack" });
  const hero = h("section", { class: "card stage-hero" });
  const stage = h("div", { class: "stage", role: "application", "aria-label": "Interactive 3D Rubik's Cube" });
  stage.append(
    h("div", { class: "stage-hud" }, [h("span", { class: "hud-k" }, ["STATE"]), h("span", { class: "hud-v", id: "stage-hud-v" }, ["READY"])]),
    h("div", { class: "hint" }, ["Drag to orbit · drag a sticker to turn · U D L R F B keys"]),
  );
  hero.append(stage);

  // transport (play buttons declared first so the closures below can update both)
  const playBtn = h("button", { class: "btn primary icon play", type: "button", "aria-label": "Play or pause solution" }, [icon(ICONS.play)]);
  const mPlayBtn = h("button", { class: "btn primary icon play", type: "button", "aria-label": "Play or pause solution" }, [icon(ICONS.play)]);
  const stopPlay = () => { if (playTimer) { clearInterval(playTimer); playTimer = undefined; } setPlayIcon(playBtn); setPlayIcon(mPlayBtn); };
  const startPlay = () => { stopPlay(); playTimer = window.setInterval(() => { if (cursor >= solution.length) { stopPlay(); return; } seek(cursor + 1); }, 650 / settings.speed); setPlayIcon(playBtn); setPlayIcon(mPlayBtn); };
  const togglePlay = () => { if (!solution.length) { toast("Solve a cube first"); return; } playTimer ? stopPlay() : startPlay(); };
  playBtn.onclick = togglePlay;
  mPlayBtn.onclick = togglePlay;
  const transport = h("div", { class: "transport" }, [
    iconBtn(ICONS.prev, "Step back", () => seek(cursor - 1)), playBtn, iconBtn(ICONS.next, "Step forward", () => seek(cursor + 1)),
  ]);
  const range = h("input", { id: "playback-range", type: "range", min: "0", max: "0", value: "0", "aria-label": "Scrub solution playback" }) as HTMLInputElement;
  range.oninput = () => seek(Number(range.value));
  const counter = h("div", { id: "playback-status", class: "playback-count" }, ["0 / 0"]);
  const speedSeg = h("div", { class: "seg", role: "group", "aria-label": "Playback speed" });
  for (const v of [0.5, 1, 1.5, 2]) {
    const b = h("button", { class: `seg-btn${v === settings.speed ? " active" : ""}`, type: "button", "aria-pressed": String(v === settings.speed) }, [`${v}×`]);
    b.onclick = () => { settings.speed = v; [...speedSeg.children].forEach((c) => { const on = c === b; c.classList.toggle("active", on); c.setAttribute("aria-pressed", String(on)); }); if (playTimer) startPlay(); };
    speedSeg.append(b);
  }
  const playbackBar = h("div", { class: "playback-bar" }, [transport, h("div", { class: "scrub" }, [range, counter]), speedSeg]);
  const list = h("div", { class: "moves strip", id: "move-list", role: "group", "aria-label": "Solution moves" });
  hero.append(playbackBar, list, h("div", { id: "solution-stages", class: "stage-notes" }));
  left.append(hero);

  // ---- right rail: controls float in glass panels ----
  const right = h("div", { class: "stack" });
  const actions = card("Solve a cube", "Choose a solver, then explore the returned algorithm move by move.");
  const solver = h("select", { id: "solver-select", "aria-label": "Solver" });
  for (const s of SOLVER_OPTIONS) solver.append(h("option", { value: s.id }, [s.name]));
  solver.value = settings.solver; solver.onchange = () => { settings.solver = solver.value; };
  const status = h("div", { id: "solve-status", role: "status", "aria-live": "polite", class: "subtle readout" }, [progressText]);
  const meter = h("div", { class: "meter", id: "solve-meter", role: "progressbar", "aria-label": "Solver progress" }, [h("span")]);
  const scramble = labelIconBtn(ICONS.shuffle, "Scramble", scrambleCube);
  const solveButton = labelIconBtn(ICONS.bolt, "Solve", solveNow, true);
  const reset = labelIconBtn(ICONS.reset, "Reset", resetCube);
  const copyLink = labelIconBtn(ICONS.link, "Share link", shareLink);
  actions.append(h("div", { class: "col" }, [h("label", { class: "field" }, ["Solver", solver]), h("div", { class: "row" }, [scramble, solveButton, reset, copyLink]), meter, status]));
  right.append(actions);

  const keys = card("Keyboard", "Turn faces from the keyboard — hold Shift to reverse.");
  const keyRow = h("div", { class: "key-row" }, [...["U", "D", "L", "R", "F", "B"].map((k) => h("kbd", {}, [k]))]);
  keys.append(keyRow, h("p", { class: "subtle hint-inline" }, ["Press ", h("kbd", {}, ["?"]), " for all shortcuts."]));
  right.append(keys);

  const painter = card("Manual color painter", "Click a sticker tile to cycle its color. The center stickers stay fixed.");
  const grid = h("div", { class: "paint-net", "aria-label": "Paint cube facelets" });
  for (let f = 0; f < 6; f++) {
    const face = h("div", { class: "paint-face", "aria-label": `${FACE_NAMES[f]} face` });
    for (let i = 0; i < 9; i++) {
      const at = f * 9 + i;
      const tile = h("button", { class: "paint-tile", "aria-label": `${FACE_NAMES[f]} sticker ${i + 1}, ${FACE_NAMES[painterColors[at]!]}` });
      tile.style.background = `var(--cube-${FACE_NAMES[painterColors[at]!]})`;
      tile.onclick = () => { if (i === 4) return; painterColors[at] = ((painterColors[at]! + 1) % 6) as Face; tile.style.background = `var(--cube-${FACE_NAMES[painterColors[at]!]})`; tile.setAttribute("aria-label", `${FACE_NAMES[f]} sticker ${i + 1}, ${FACE_NAMES[painterColors[at]!]}`); validatePaint(); };
      face.append(tile);
    }
    grid.append(face);
  }
  const validity = h("p", { id: "paint-validity", class: "subtle", role: "status" }, ["Solved cube is valid"]);
  const validatePaint = () => { const v = validateFacelets(painterColors); validity.textContent = v.ok ? "✓ Valid reachable cube" : `Needs fixing: ${v.message}`; validity.className = `subtle ${v.ok ? "valid" : "invalid"}`; };
  painter.append(grid, validity, h("div", { class: "row" }, [button("Use painted cube", () => { const v = validateFacelets(painterColors); if (!v.ok || !v.cube) { validatePaint(); return; } startCube = v.cube; solution = []; solutionStages = []; cursor = 0; setCube(v.cube); toast("Painted cube loaded"); }), button("Clear to solved", () => { painterColors = SOLVED_FACELETS.slice(); render(); })])); right.append(painter);

  // ---- mobile bottom-sheet action bar (shown only < 760px) ----
  const mobileBar = h("div", { class: "mobile-actions", "aria-label": "Quick actions" }, [
    h("div", { class: "grab", "aria-hidden": "true" }),
    h("div", { class: "mobile-actions-row" }, [
      iconBtn(ICONS.prev, "Step back", () => seek(cursor - 1)),
      mPlayBtn,
      iconBtn(ICONS.next, "Step forward", () => seek(cursor + 1)),
      labelIconBtn(ICONS.shuffle, "Scramble", scrambleCube),
      labelIconBtn(ICONS.bolt, "Solve", solveNow, true),
    ]),
  ]);
  layout.append(left, right, mobileBar);
  queueMicrotask(() => {
    if (!stage.isConnected) return;
    void import("./cube3d/CubeView").then(({ CubeView: LazyCubeView }) => {
      if (!stage.isConnected) return;
      currentView = new LazyCubeView(stage, { reducedMotion }); currentView.setCube(cube);
      currentView.onMove = commitTurn;
      renderPlayback();
    }).catch((e) => {
      stage.replaceChildren(h("p", { class: "subtle invalid", role: "alert" }, [`3D view unavailable: ${(e as Error).message}. You can still scramble, solve, and use keyboard moves.`]));
    });
  });
  return layout;
}
let playTimer: number | undefined;

const RANK_LABEL = ["1st", "2nd", "3rd", "4th"];
function raceEmptyState() {
  return h("div", { class: "empty", id: "race-empty" }, [
    h("div", { class: "glyph" }, [icon(ICONS.flag, 22)]),
    h("h3", {}, ["Ready to race"]),
    h("p", {}, ["Pick 2–4 solvers, then start — each runs the same scramble in its own worker. Watch the search unfold; first correct completion wins."]),
  ]);
}
function buildRace() {
  const c = h("section", { class: "card" });
  const competitors = SOLVER_OPTIONS.filter((x) => !x.id.includes("2x2"));
  const defaults = ["kociemba", "thistlethwaite", "beginner", "ida-pdb"];
  const checks = h("div", { class: "race-options", role: "group", "aria-label": "Choose competitors" });
  for (const s of competitors) {
    const cb = h("input", { type: "checkbox", value: s.id, checked: defaults.includes(s.id) });
    checks.append(h("label", { class: "competitor", style: `--row-accent: var(--solver-${s.id})` }, [cb, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "competitor-name" }, [s.name])]));
  }
  const output = h("div", { id: "race-results", class: "stack" });
  output.append(raceEmptyState());

  const startRace = () => {
    for (const job of raceJobs.splice(0)) job.cancel();
    for (const timer of raceTimers.splice(0)) clearInterval(timer);
    const selected = [...checks.querySelectorAll<HTMLInputElement>("input:checked")].map((x) => x.value);
    if (selected.length < 2 || selected.length > 4) { toast("Select 2–4 solvers"); return; }
    output.replaceChildren();
    delete output.dataset.winner;
    const banner = h("div", { class: "winner-banner hidden", role: "status", "aria-live": "polite" });
    output.append(banner);
    let finishCount = 0;
    for (const id of selected) {
      const title = SOLVER_OPTIONS.find((x) => x.id === id)!.name;
      const rank = h("span", { class: "rank" }, ["running"]);
      const stats = h("span", { class: "race-stat readout" }, ["Starting…"]);
      const bar = h("div", { class: "meter", role: "progressbar", "aria-label": `${title} progress` }, [h("span")]);
      const row = h("div", { class: "race-row", style: `--row-accent: var(--solver-${id})` }, [
        h("div", { class: "race-row-head" }, [h("span", { class: "dot", "aria-hidden": "true" }), h("strong", {}, [title]), rank]),
        stats, bar,
      ]);
      output.append(row);
      const startedAt = performance.now(); let liveNodes = 0; let liveDepth = 0; let finished = false;
      const clock = window.setInterval(() => { if (!finished) stats.textContent = `${liveNodes.toLocaleString()} nodes${liveDepth ? ` · depth ${liveDepth}` : ""} · ${(performance.now() - startedAt).toFixed(0)} ms`; }, 250);
      raceTimers.push(clock);
      const job = runSolve(id, cube, { timeoutMs: 30000, progressInterval: 25000 }, {
        onProgress: (p) => { liveNodes = p.nodesExpanded; liveDepth = p.threshold ?? p.g ?? 0; stats.textContent = `${p.nodesExpanded.toLocaleString()} nodes${p.threshold == null ? "" : ` · depth ${p.threshold}`} · ${p.phase ?? "searching"}`; (bar.firstElementChild as HTMLElement).style.width = `${Math.min(95, Math.log10(p.nodesExpanded + 1) * 15)}%`; },
        onBuilding: (t) => { stats.textContent = `Building ${t}…`; },
      });
      raceJobs.push(job);
      job.promise.then((r) => {
        finished = true; clearInterval(clock);
        (bar.firstElementChild as HTMLElement).style.width = r.solved ? "100%" : "0%";
        bar.setAttribute("aria-valuenow", r.solved ? "100" : "0");
        if (r.solved) {
          const place = finishCount++;
          stats.textContent = `${r.stats.solutionLength} moves · ${r.stats.timeMs.toFixed(0)} ms · ${r.stats.nodesExpanded.toLocaleString()} nodes`;
          rank.textContent = RANK_LABEL[place] ?? `#${place + 1}`;
          rank.classList.add("placed");
          if (place === 0) {
            output.dataset.winner = id; row.classList.add("winner");
            rank.classList.add("gold");
            banner.replaceChildren(icon(ICONS.trophy, 18), h("span", {}, [`${title} wins — ${r.stats.solutionLength} moves in ${r.stats.timeMs.toFixed(0)} ms`]));
            banner.classList.remove("hidden");
            toast(`${title} takes the race`);
          }
        } else {
          stats.textContent = r.timedOut ? "Timed out" : "No solution";
          rank.textContent = r.timedOut ? "timeout" : "—";
        }
      }).catch((e) => { finished = true; clearInterval(clock); stats.textContent = `Error: ${e.message}`; rank.textContent = "error"; });
    }
  };
  const newScramble = () => {
    const sc = randomScramble(20, Math.floor(Math.random() * 0xffffffff));
    painterColors = cubieToFacelet(sc.cube); startCube = sc.cube; solution = []; solutionStages = []; cursor = 0; setCube(sc.cube);
    window.sessionStorage.setItem("cubelab-scramble", sc.alg);
    for (const job of raceJobs.splice(0)) job.cancel();
    for (const timer of raceTimers.splice(0)) clearInterval(timer);
    output.replaceChildren(raceEmptyState());
    toast("New scramble loaded");
  };

  c.append(
    h("p", { class: "eyebrow" }, ["COMPETITORS"]),
    checks,
    h("div", { class: "row race-controls" }, [labelIconBtn(ICONS.flag, "Start race", startRace, true), labelIconBtn(ICONS.shuffle, "New scramble", newScramble)]),
    output,
  );
  return c;
}
function buildExplorer() {
  const c = h("section", { class: "card" });
  const vThreshold = h("div", { class: "v" }, ["—"]);
  const vG = h("div", { class: "v" }, ["—"]);
  const vH = h("div", { class: "v" }, ["—"]);
  const vNodes = h("div", { class: "v" }, ["—"]);
  const statGrid = h("div", { class: "stat-grid" }, [statTile("Threshold", vThreshold), statTile("g(n)", vG), statTile("h(n)", vH), statTile("Nodes", vNodes)]);
  const legend = h("div", { class: "chart-legend" }, [legendItem("var(--accent)", "g(n) — path cost"), legendItem("var(--solver-thistlethwaite)", "h(n) — heuristic")]);
  const chart = h("div", { class: "explorer-chart", id: "explorer-chart", "aria-label": "Search depth and heuristic samples" });
  const tree = h("div", { class: "tree-samples", id: "tree-samples" });
  const note = h("small", { class: "subtle" }, ["Each bar pairs g(n) (depth so far) with h(n) (admissible estimate); the frontier below samples sampled nodes. The engine emits throttled telemetry."]);
  const live = h("div", { class: "explorer-live" }, [statGrid, legend, chart, note, tree]);
  const body = h("div", { class: "explorer-body" }, [emptyState(ICONS.search, "Inspect a search", "Start an IDA* exploration to stream thresholds, g/h samples and the frontier it expands.")]);
  const summary = h("p", { id: "explorer-status", role: "status", class: "subtle readout" }, ["Ready."]);

  const start = labelIconBtn(ICONS.search, "Start IDA* exploration", () => {
    body.replaceChildren(live);
    chart.replaceChildren(); tree.replaceChildren();
    vThreshold.textContent = vG.textContent = vH.textContent = vNodes.textContent = "—";
    summary.className = "subtle readout"; summary.textContent = "Starting worker…";
    const samples: SolverProgress[] = [];
    activeJob?.cancel();
    activeJob = runSolve("ida-pdb", cube, { timeoutMs: 30000, maxDepth: 8, progressInterval: 1000 }, {
      onBuilding: (t) => { summary.textContent = `Building ${t}…`; },
      onProgress: (p) => {
        samples.push(p);
        vThreshold.textContent = String(p.threshold ?? "—");
        vG.textContent = String(p.g ?? "—");
        vH.textContent = String(p.h ?? "—");
        vNodes.textContent = p.nodesExpanded.toLocaleString();
        summary.textContent = `Threshold ${p.threshold ?? "—"} · ${p.nodesExpanded.toLocaleString()} nodes expanded`;
        const sample = h("div", { class: "chart-sample", title: `g ${p.g ?? 0}, h ${p.h ?? 0}` });
        const gBar = h("span", { class: "chart-bar g-bar" });
        const hBar = h("span", { class: "chart-bar h-bar" });
        gBar.style.height = `${Math.max(4, Math.min(100, (p.g ?? 0) * 10))}%`;
        hBar.style.height = `${Math.max(4, Math.min(100, (p.h ?? 0) * 10))}%`;
        sample.append(gBar, hBar); chart.append(sample);
        if (samples.length < 24) { const level = Math.min(6, p.g ?? 0); const node = h("span", { class: "tree-node", title: `sampled depth ${level}; h=${p.h ?? 0}` }, [`g${level} · h${p.h ?? 0}`]); node.style.marginLeft = `${level * 14}px`; tree.append(node); }
      },
    });
    activeJob.promise
      .then((r) => { summary.className = `subtle readout ${r.solved ? "valid" : ""}`; summary.textContent = `${r.solved ? "Solved" : "Search ended"} · ${r.stats.nodesExpanded.toLocaleString()} nodes · ${r.stats.timeMs.toFixed(0)} ms`; })
      .catch((e) => { summary.className = "subtle readout invalid"; summary.textContent = `Search error: ${e.message}`; });
  }, true);
  const cancel = labelIconBtn(ICONS.stop, "Cancel", () => { activeJob?.cancel(); summary.textContent = "Search cancelled."; });

  c.append(h("div", { class: "row" }, [start, cancel]), summary, body);
  return c;
}
function buildLab() {
  const c = h("section", { class: "card" });
  const corners = h("input", { type: "checkbox", checked: true, "aria-label": "Corner pattern database" }) as HTMLInputElement;
  const edges = h("input", { type: "checkbox", checked: true, "aria-label": "Edge orientation table" }) as HTMLInputElement;
  const options = h("div", { class: "race-options" }, [
    h("label", { class: "competitor", style: "--row-accent: var(--accent)" }, [corners, h("span", { class: "competitor-name" }, ["Corner pattern database"])]),
    h("label", { class: "competitor", style: "--row-accent: var(--solver-thistlethwaite)" }, [edges, h("span", { class: "competitor-name" }, ["Edge orientation table"])]),
  ]);
  const describe = (cfg: { corners: boolean; edgeOrientation: boolean }) => [cfg.corners ? "corners" : "", cfg.edgeOrientation ? "EO" : ""].filter(Boolean).join(" + ") || "none";

  const results = h("div", { class: "lab-results" });
  const empty = emptyState(ICONS.flask, "Compare heuristics", "Toggle the admissible tables, then compare search cost against the full configuration on the same cube (8-move cap).");
  const body = h("div", { class: "lab-body" }, [empty]);

  const runCompare = () => {
    const configs = [
      { name: "Selected tables", heuristic: { corners: corners.checked, edgeOrientation: edges.checked } },
      { name: "Both tables", heuristic: { corners: true, edgeOrientation: true } },
    ];
    const rows = configs.map((cfg) => {
      const vNodes = h("div", { class: "lab-nodes" }, ["searching…"]);
      const vMeta = h("div", { class: "lab-meta subtle" }, [" "]);
      const bar = h("div", { class: "meter indeterminate" }, [h("span")]);
      const card = h("div", { class: "lab-result" }, [
        h("div", { class: "lab-result-head" }, [h("strong", {}, [cfg.name]), h("span", { class: "badge" }, [describe(cfg.heuristic)])]),
        vNodes, vMeta, bar,
      ]);
      return { cfg, card, vNodes, vMeta, bar, nodes: undefined as number | undefined };
    });
    results.replaceChildren(...rows.map((r) => r.card));
    body.replaceChildren(results);
    const renderBars = () => {
      const vals = rows.filter((r) => r.nodes !== undefined).map((r) => r.nodes!);
      if (!vals.length) return;
      const max = Math.max(1, ...vals);
      for (const r of rows) if (r.nodes !== undefined) (r.bar.firstElementChild as HTMLElement).style.width = `${Math.max(3, (r.nodes / max) * 100)}%`;
    };
    for (const r of rows) {
      runSolve("ida-pdb", cube, { timeoutMs: 30000, maxDepth: 8, heuristic: r.cfg.heuristic }, {}).promise
        .then((res) => {
          r.nodes = res.stats.nodesExpanded;
          r.bar.classList.remove("indeterminate");
          r.vNodes.textContent = `${res.stats.nodesExpanded.toLocaleString()} nodes`;
          r.vMeta.textContent = `${res.stats.timeMs.toFixed(1)} ms${res.solved ? ` · ${res.stats.solutionLength} moves` : res.timedOut ? " · capped" : ""}`;
          renderBars();
        })
        .catch((e) => { r.bar.classList.remove("indeterminate"); r.vNodes.textContent = "error"; r.vMeta.textContent = (e as Error).message; });
    }
  };

  c.append(
    h("p", { class: "eyebrow" }, ["ADMISSIBLE TABLES"]),
    options,
    h("div", { class: "row lab-controls" }, [labelIconBtn(ICONS.flask, "Compare heuristics", runCompare, true)]),
    body,
  );
  return c;
}
function buildDoctor() {
  const c = h("section", { class: "card" });
  const statusIcon = h("span", { class: "doctor-icon", "aria-hidden": "true" }, [icon(ICONS.check, 20)]);
  const statusTitle = h("strong", {}, ["Checking…"]);
  const statusMsg = h("p", { class: "subtle" }, ["Reading the current painted stickers."]);
  const status = h("div", { class: "doctor-status", role: "status", "aria-live": "polite" }, [statusIcon, h("div", { class: "doctor-status-body" }, [statusTitle, statusMsg])]);
  const fixes = h("ul", { class: "fix-list" });
  const validate = () => {
    const v = validateFacelets(painterColors);
    status.classList.toggle("ok", v.ok);
    status.classList.toggle("bad", !v.ok);
    statusIcon.replaceChildren(icon(v.ok ? ICONS.check : ICONS.alert, 20));
    statusTitle.textContent = v.ok ? "Reachable cube" : "Needs fixing";
    statusMsg.textContent = v.ok ? "These stickers describe a cube that can be solved from a real scramble." : v.message;
    fixes.replaceChildren();
    if (!v.ok) {
      const first = v.reasons[0];
      const advice = first?.code === "BAD_COLOR_COUNT" ? "Minimal count repair: recolor one sticker from an over-counted face to a missing color." : first?.code === "CORNER_TWIST" ? "Minimal orientation repair: twist one corner's sticker set once; the total must be 0 mod 3." : first?.code === "EDGE_FLIP" ? "Minimal orientation repair: flip one edge piece; the total must be 0 mod 2." : first?.code === "PERMUTATION_PARITY" ? "Minimal parity repair: exchange two stickers for a paired edge or corner swap." : first?.code === "DUPLICATE_CORNER" ? "Piece repair: correct a sticker on one of the duplicate corners so every corner appears once." : first?.code === "DUPLICATE_EDGE" ? "Piece repair: correct a sticker on one of the duplicate edges so every edge appears once." : "Piece repair: correct one sticker in the reported corner or edge slot so it matches a real piece.";
      fixes.append(h("li", {}, [advice]));
      if (first?.code === "BAD_COLOR_COUNT") {
        const counts = v.reasons.filter((r) => r.code === "BAD_COLOR_COUNT");
        const over = counts.find((r) => r.count > 9);
        const under = counts.find((r) => r.count < 9);
        const from = over ? FACE_NAMES.indexOf(over.color as typeof FACE_NAMES[number]) : -1;
        const to = under ? FACE_NAMES.indexOf(under.color as typeof FACE_NAMES[number]) : -1;
        const at = from >= 0 ? Array.from({ length: 9 }, (_, i) => from * 9 + i).find((i) => i % 9 !== 4 && painterColors[i] === from) : undefined;
        if (at !== undefined && under && to >= 0) fixes.append(h("li", {}, [button(`Apply one-sticker fix: ${over!.color} → ${under.color}`, () => { painterColors[at] = to as Face; validate(); toast("Applied one-sticker count correction"); })]));
      }
    }
  };
  c.append(status, fixes, h("div", { class: "row doctor-controls" }, [labelIconBtn(ICONS.stethoscope, "Re-check painted state", validate, true)]), h("p", { class: "subtle doctor-note" }, ["Paint stickers in the Solve view's color painter, then re-check the arrangement here."]));
  queueMicrotask(validate);
  return c;
}
function buildLearn() {
  const c = h("section", { class: "card" });
  const info = h("p", { class: "learn-hint-text", id: "learn-hint", role: "status", "aria-live": "polite" }, ["Solve the cube, then reveal its moves one at a time and play them yourself."]);
  learnHint = info;
  const hintPanel = h("div", { class: "learn-hint-panel" }, [h("span", { class: "learn-glyph", "aria-hidden": "true" }, [icon(ICONS.graduation, 20)]), info]);
  const faceBtn = (label: string, fn: () => void, aria: string) => { const b = button(label, fn, false, aria); b.classList.add("face-btn"); return b; };
  const faces = h("div", { class: "face-grid", "aria-label": "Try a face turn" });
  for (const f of [Face.U, Face.D, Face.L, Face.R, Face.F, Face.B]) {
    faces.append(h("div", { class: "face-pair" }, [faceBtn(FACE_NAMES[f], () => commitTurn(f, 1), `Try ${FACE_NAMES[f]} clockwise`), faceBtn(`${FACE_NAMES[f]}'`, () => commitTurn(f, 3), `Try ${FACE_NAMES[f]} counter-clockwise`)]));
  }
  const reveal = button("Reveal next move", () => {
    if (!solution.length) { info.textContent = "No solution yet — solve this cube first."; return; }
    info.textContent = `Hint ${learnStep + 1}/${solution.length}: play ${MOVES[solution[learnStep]!]!.name} with the keyboard or the buttons below.`;
  });
  c.append(
    hintPanel,
    h("div", { class: "row learn-controls" }, [labelIconBtn(ICONS.graduation, "Solve for hints", () => { learnStep = 0; solveNow(); }, true), reveal]),
    h("p", { class: "eyebrow" }, ["TRY A TURN"]),
    faces,
  );
  return c;
}
type Aggregate = { solver: string; depth: string; count: number; successRate: number; avgLength: number; avgTimeMs: number; avgNodes: number };
const solverVar = (id: string) => (["kociemba", "thistlethwaite", "beginner", "ida-pdb", "bfs-2x2", "bibfs-2x2"].includes(id) ? `var(--solver-${id})` : "var(--accent)");
const solverName = (id: string) => SOLVER_OPTIONS.find((s) => s.id === id)?.name ?? id;
const BENCH_METRICS = [
  { id: "moves", label: "Avg moves", get: (a: Aggregate) => a.avgLength, fmt: (v: number) => v.toFixed(1), log: false },
  { id: "time", label: "Avg time", get: (a: Aggregate) => a.avgTimeMs, fmt: (v: number) => `${v.toFixed(0)} ms`, log: false },
  { id: "nodes", label: "Avg nodes", get: (a: Aggregate) => a.avgNodes, fmt: (v: number) => Math.round(v).toLocaleString(), log: true },
] as const;

function benchChart(aggs: Aggregate[], metricId: string) {
  const metric = BENCH_METRICS.find((m) => m.id === metricId) ?? BENCH_METRICS[0]!;
  const depths = [...new Set(aggs.map((a) => a.depth))];
  const solvers = [...new Set(aggs.map((a) => a.solver))];
  const vals = aggs.map((a) => metric.get(a));
  const max = Math.max(1, ...vals);
  const scale = (v: number) => (metric.log ? Math.log10(v + 1) / Math.log10(max + 1) : v / max);
  const yTick = (f: number) => metric.fmt(metric.log ? Math.pow(10, Math.log10(max + 1) * f) - 1 : max * f);
  const yaxis = h("div", { class: "chart-y" }, [1, 0.75, 0.5, 0.25, 0].map((f) => h("span", {}, [yTick(f)])));
  const plot = h("div", { class: "chart-plot" });
  for (const depth of depths) {
    const bars = h("div", { class: "bars" });
    for (const solver of solvers) {
      const a = aggs.find((x) => x.solver === solver && x.depth === depth);
      if (!a) continue;
      const v = metric.get(a);
      const bar = h("div", { class: "bar", style: `background:${solverVar(solver)}`, title: `${solverName(solver)} · depth ${depth}: ${metric.fmt(v)}` });
      bars.append(bar);
      requestAnimationFrame(() => { bar.style.height = `${Math.max(1, scale(v) * 100)}%`; });
    }
    plot.append(h("div", { class: "chart-group" }, [bars, h("span", { class: "xlabel" }, [depth])]));
  }
  return h("div", { class: "chart" }, [yaxis, plot]);
}

function buildBench() {
  const c = h("section", { class: "card" });
  let aggs = (benchmarkData.aggregates ?? []) as Aggregate[];
  let metricId = "moves";

  const summary = h("div", { class: "stat-grid bench-summary" });
  const legend = h("div", { class: "chart-legend" });
  const chartWrap = h("div", { class: "chart-wrap" });
  const table = h("div", { class: "bench-table-wrap" });

  const chartTitle = h("p", { class: "eyebrow" }, ["AVG MOVES BY SCRAMBLE DEPTH"]);
  const metricSeg = h("div", { class: "seg", role: "group", "aria-label": "Chart metric" });
  for (const m of BENCH_METRICS) {
    const b = h("button", { class: `seg-btn${m.id === metricId ? " active" : ""}`, type: "button", "aria-pressed": String(m.id === metricId) }, [m.label]);
    b.onclick = () => { metricId = m.id; [...metricSeg.children].forEach((x) => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-pressed", String(on)); }); chartTitle.textContent = `${m.label.toUpperCase()} BY SCRAMBLE DEPTH`; chartWrap.replaceChildren(benchChart(aggs, metricId)); };
    metricSeg.append(b);
  }

  const renderAll = () => {
    const solvers = [...new Set(aggs.map((a) => a.solver))];
    const scrambles = aggs.reduce((n, a) => n + a.count, 0);
    const solved = aggs.filter((a) => a.successRate > 0);
    const fastest = solved.length ? solved.reduce((best, a) => (a.avgTimeMs < best.avgTimeMs ? a : best)) : undefined;
    const vSolvers = h("div", { class: "v" }, ["0"]);
    const vGroups = h("div", { class: "v" }, ["0"]);
    const vScrambles = h("div", { class: "v" }, ["0"]);
    const vFastest = h("div", { class: "v" }, ["—"]);
    summary.replaceChildren(statTile("Solvers", vSolvers), statTile("Test groups", vGroups), statTile("Scrambles", vScrambles), statTile("Fastest avg", vFastest));
    tickUp(vSolvers, solvers.length);
    tickUp(vGroups, aggs.length);
    tickUp(vScrambles, scrambles);
    if (fastest) tickUp(vFastest, fastest.avgTimeMs, (n) => `${Math.round(n)} ms`);
    legend.replaceChildren(...solvers.map((s) => h("span", { class: "legend-item" }, [h("span", { class: "dot", style: `--row-accent:${solverVar(s)}`, "aria-hidden": "true" }), solverName(s)])));
    chartWrap.replaceChildren(benchChart(aggs, metricId));
    const cols: [string, string][] = [["Solver", ""], ["Depth", "num"], ["Solved", "num"], ["Avg moves", "num"], ["Avg time", "num"], ["Avg nodes", "num"]];
    const head = h("tr", {}, cols.map(([t, cls]) => h("th", { class: cls }, [t])));
    const body = h("tbody", {}, aggs.map((a) => h("tr", {}, [
      h("td", {}, [h("span", { class: "dot", style: `--row-accent:${solverVar(a.solver)}`, "aria-hidden": "true" }), solverName(a.solver)]),
      h("td", { class: "num" }, [a.depth]),
      h("td", { class: "num" }, [`${Math.round(a.successRate * a.count)}/${a.count}`]),
      h("td", { class: "num" }, [a.avgLength.toFixed(1)]),
      h("td", { class: "num" }, [`${a.avgTimeMs.toFixed(0)} ms`]),
      h("td", { class: "num" }, [Math.round(a.avgNodes).toLocaleString()]),
    ])));
    table.replaceChildren(h("table", { class: "bench-table" }, [h("thead", {}, [head]), body]));
  };

  const input = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Load benchmark JSON" }) as HTMLInputElement;
  input.onchange = async () => { const file = input.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()) as { aggregates?: Aggregate[] }; if (!Array.isArray(data.aggregates)) throw Error("Missing aggregates array"); aggs = data.aggregates; renderAll(); toast(`Loaded ${data.aggregates.length} benchmark groups`); } catch (e) { toast(`Could not load benchmark JSON: ${(e as Error).message}`); } };
  const download = labelIconBtn(ICONS.link, "Download JSON", () => { const blob = new Blob([JSON.stringify(benchmarkData, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "cubelab-benchmark-results.json"; a.click(); URL.revokeObjectURL(url); });

  if (!aggs.length) {
    c.append(h("div", { class: "empty" }, [h("div", { class: "glyph" }, [icon(ICONS.chart, 22)]), h("h3", {}, ["No benchmark data"]), h("p", {}, ["Load a results JSON from a benchmark run to see the dashboard."]), h("div", { class: "row" }, [input])]));
    return c;
  }
  renderAll();
  c.append(
    summary,
    h("div", { class: "bench-chart-head" }, [chartTitle, metricSeg]),
    legend,
    chartWrap,
    h("p", { class: "subtle bench-note" }, ["Bundled measured dataset — machine-dependent. Methodology and limits: docs/BENCHMARK_ANALYSIS.md."]),
    h("div", { class: "row bench-actions" }, [input, download]),
    table,
  );
  return c;
}
function buildScannerView() {
  return buildScanner((next) => { if (next) { startCube = next; setCube(next); activeTab = "solve"; render(); toast("Valid scanned cube loaded"); } });
}
function render() {
  activeJob?.cancel(); activeJob = undefined;
  currentView?.dispose();
  currentView = undefined;
  for (const job of raceJobs.splice(0)) job.cancel();
  for (const timer of raceTimers.splice(0)) clearInterval(timer);
  tabs.querySelectorAll("[role=tab]").forEach((t, i) => t.setAttribute("aria-selected", tabNames[i]![0] === activeTab ? "true" : "false"));
  content.replaceChildren();
  if (!localStorage.getItem("cubelab-onboarded")) {
    const welcome = h("section", { class: "card onboarding" }, [h("h2", {}, ["Welcome to CubeLab"]), h("p", { class: "subtle" }, ["Scramble or paint a cube, choose a solver, then inspect every move. Keyboard: U D L R F B; hold Shift for the inverse. Use the tabs to explore solver internals and the camera scanner."]), button("Got it", () => { localStorage.setItem("cubelab-onboarded", "yes"); welcome.remove(); })]);
    content.append(welcome);
  }
  const views: Record<string, () => HTMLElement> = { solve: buildSolveView, race: buildRace, explorer: buildExplorer, lab: buildLab, doctor: buildDoctor, learn: buildLearn, scanner: buildScannerView, bench: buildBench };
  const viewEl = h("div", { class: "view" }, [pageHeader(activeTab), views[activeTab]!()]);
  content.append(viewEl);
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { toggleShortcuts(false); return; }
  if (e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
  if (e.key === "?") { toggleShortcuts(); return; }
  if ("UDLRFB".includes(e.key.toUpperCase()) && e.key.length === 1) { const f = FACE_NAMES.indexOf(e.key.toUpperCase() as typeof FACE_NAMES[number]); if (f >= 0) commitTurn(f as Face, e.shiftKey ? 3 : 1); }
  if (e.key === "ArrowLeft" && solution.length) seek(cursor - 1);
  if (e.key === "ArrowRight" && solution.length) seek(cursor + 1);
});
document.addEventListener("click", (e) => {
  if (shortcutsPanel.classList.contains("hidden")) return;
  if (!shortcutsPanel.contains(e.target as Node) && !helpButton.contains(e.target as Node)) toggleShortcuts(false);
});

const params = new URLSearchParams(location.hash.slice(1));
const initialAlg = params.get("s");
if (initialAlg && initialAlg !== "random state") {
    try { const names = initialAlg.trim().split(/\s+/).filter(Boolean); let c = solvedCube(); for (const name of names) { const i = MOVES.findIndex((m) => m.name === name); if (i < 0) throw Error("bad move"); c = applyMoveIndex(c, i); } cube = c; startCube = c; painterColors = cubieToFacelet(c); }
  catch { toast("Shared cube link was not valid; loaded solved cube."); }
}
const initialSolution = params.get("a");
if (initialSolution) {
  try { solution = initialSolution.trim().split(/\s+/).filter(Boolean).map((name) => { const i = MOVES.findIndex((m) => m.name === name); if (i < 0) throw Error("bad move"); return i; }); }
  catch { solution = []; toast("Shared solution was not valid; loaded the cube only."); }
}
render();
