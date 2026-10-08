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
  const slider = document.querySelector<HTMLInputElement>("#playback-range");
  if (slider) { slider.max = String(solution.length); slider.value = String(cursor); }
  if (label) label.textContent = `${cursor} / ${solution.length} moves`;
  if (stages) { let offset = 0; stages.replaceChildren(...solutionStages.map((s, i) => { const begin = offset; offset += s.moves.length; const active = cursor >= begin && (cursor < offset || (i === solutionStages.length - 1 && cursor === solution.length)); return h("div", { class: `stage-note${active ? " active" : ""}` }, [h("strong", {}, [s.label]), h("span", {}, [s.explanation])]); })); }
}
function seek(n: number) {
  cursor = Math.max(0, Math.min(solution.length, n));
  let c = { cp: startCube.cp.slice(), co: startCube.co.slice(), ep: startCube.ep.slice(), eo: startCube.eo.slice() };
  for (let i = 0; i < cursor; i++) c = applyMoveIndex(c, solution[i]!);
  cube = c; currentView?.setCube(cube); renderPlayback();
}
function buildSolveView() {
  const layout = h("div", { class: "layout" });
  const left = h("div", { class: "stack" });
  const stageCard = card("Cube", "Drag the background to orbit · U D L R F B keys turn faces · Shift reverses");
  const stage = h("div", { class: "stage", role: "application", "aria-label": "Interactive 3D Rubik's Cube" });
  stageCard.append(stage); left.append(stageCard);
  const playback = card("Solution playback", "Scrub or select a move to inspect the solution.");
  const controls = h("div", { class: "row" });
  controls.append(button("Back", () => seek(cursor - 1), false, "Step back"), button("Play / pause", () => { if (playTimer) { clearInterval(playTimer); playTimer = undefined; } else playTimer = window.setInterval(() => { if (cursor >= solution.length) { clearInterval(playTimer); playTimer = undefined; return; } seek(cursor + 1); }, 650 / settings.speed); }, false, "Play or pause solution"), button("Next", () => seek(cursor + 1), false, "Step forward"));
  const range = h("input", { id: "playback-range", type: "range", min: "0", max: "0", value: "0", "aria-label": "Scrub solution playback" }) as HTMLInputElement;
  range.oninput = () => seek(Number(range.value));
  const speed = h("label", { class: "field" }, ["Playback speed", h("input", { type: "range", min: "0.5", max: "2", step: "0.25", value: "1", "aria-label": "Playback speed" })]);
  (speed.querySelector("input") as HTMLInputElement).oninput = (e) => { settings.speed = Number((e.target as HTMLInputElement).value); };
  const list = h("div", { class: "moves", id: "move-list", role: "group", "aria-label": "Solution moves" });
  playback.append(controls, range, speed, h("div", { id: "playback-status", class: "subtle" }, ["0 / 0 moves"]), list, h("div", { id: "solution-stages", class: "stage-notes" })); left.append(playback);
  const right = h("div", { class: "stack" });
  const actions = card("Solve a cube", "Choose a solver, then explore the returned algorithm move by move.");
  const solver = h("select", { id: "solver-select", "aria-label": "Solver" });
  for (const s of SOLVER_OPTIONS) solver.append(h("option", { value: s.id }, [s.name]));
  solver.value = settings.solver; solver.onchange = () => { settings.solver = solver.value; };
  const status = h("div", { id: "solve-status", role: "status", "aria-live": "polite", class: "subtle" }, [progressText]);
  const meter = h("div", { class: "meter", id: "solve-meter", role: "progressbar", "aria-label": "Solver progress" }, [h("span")]);
  const scramble = button("Scramble", () => {
    const sc = randomScramble(20, Math.floor(Math.random() * 0xffffffff)); const next = sc.cube; startCube = next; solution = []; solutionStages = []; cursor = 0; painterColors = cubieToFacelet(next); setCube(next);
    window.sessionStorage.setItem("cubelab-scramble", sc.alg); progressText = `Scramble: ${sc.alg}`; render();
  });
  const solveButton = button("Solve", solveNow, true);
  const reset = button("Reset", () => { activeJob?.cancel(); activeJob = undefined; solution = []; solutionStages = []; cursor = 0; startCube = solvedCube(); painterColors = SOLVED_FACELETS.slice(); setCube(solvedCube()); window.sessionStorage.removeItem("cubelab-scramble"); render(); });
  const copyLink = button("↗ Share link", () => { updateHash(); void navigator.clipboard?.writeText(location.href).then(() => toast("Share link copied")).catch(() => toast("Copy the link from the address bar")); });
  actions.append(h("div", { class: "row" }, [solver]), h("div", { class: "row" }, [scramble, solveButton, reset, copyLink]), meter, status); right.append(actions);
  const keys = card("Keyboard moves", "Press a face key to turn clockwise; hold Shift for counter-clockwise.");
  keys.append(h("p", { class: "subtle" }, ["U · D · L · R · F · B"])); right.append(keys);
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
  layout.append(left, right);
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

function buildRace() {
  const c = h("section", { class: "card" });
  const checks = h("div", { class: "race-options" });
  const defaults = ["kociemba", "thistlethwaite", "beginner", "ida-pdb"];
  for (const s of SOLVER_OPTIONS.filter((x) => !x.id.includes("2x2"))) checks.append(h("label", {}, [h("input", { type: "checkbox", value: s.id, checked: defaults.includes(s.id) }), ` ${s.name}`]));
  const output = h("div", { id: "race-results", class: "stack" });
  c.append(checks, h("div", { class: "row" }, [button("Start race", () => {
    output.replaceChildren();
    for (const job of raceJobs.splice(0)) job.cancel();
    for (const timer of raceTimers.splice(0)) clearInterval(timer);
    const selected = [...checks.querySelectorAll<HTMLInputElement>("input:checked")].map((x) => x.value);
    if (selected.length < 2 || selected.length > 4) { toast("Select 2–4 solvers"); return; }
    const jobs = selected.map((id) => {
      const row = h("div", { class: "race-row" }); const title = SOLVER_OPTIONS.find((x) => x.id === id)!.name;
      const stats = h("span", { class: "subtle" }, ["Starting…"]); const bar = h("div", { class: "meter" }, [h("span")]); row.append(h("strong", {}, [title]), stats, bar); output.append(row);
      const startedAt = performance.now(); let liveNodes = 0; let liveDepth = 0; let finished = false;
      const clock = window.setInterval(() => { if (!finished) stats.textContent = `${liveNodes.toLocaleString()} nodes${liveDepth ? ` · depth ${liveDepth}` : ""} · ${(performance.now() - startedAt).toFixed(0)} ms`; }, 250);
      raceTimers.push(clock);
      const job = runSolve(id, cube, { timeoutMs: 30000, progressInterval: 25000 }, { onProgress: (p) => { liveNodes = p.nodesExpanded; liveDepth = p.threshold ?? p.g ?? 0; stats.textContent = `${p.nodesExpanded.toLocaleString()} nodes${p.threshold == null ? "" : ` · depth ${p.threshold}`} · ${p.phase ?? "searching"}`; (bar.firstElementChild as HTMLElement).style.width = `${Math.min(95, Math.log10(p.nodesExpanded + 1) * 15)}%`; }, onBuilding: (t) => { stats.textContent = `Building ${t}…`; } });
      raceJobs.push(job);
      job.promise.then((r) => { finished = true; clearInterval(clock); stats.textContent = r.solved ? `${r.stats.solutionLength} moves · ${r.stats.timeMs.toFixed(0)} ms` : r.timedOut ? "Timed out" : "No solution"; (bar.firstElementChild as HTMLElement).style.width = r.solved ? "100%" : "0%"; if (r.solved && !output.dataset.winner) { output.dataset.winner = id; row.classList.add("winner"); toast(`${title} wins the race!`); } }).catch((e) => { finished = true; clearInterval(clock); stats.textContent = `Error: ${e.message}`; });
      return job;
    });
  }), button("Race a new scramble", () => { const sc = randomScramble(20, Math.floor(Math.random() * 0xffffffff)); painterColors = cubieToFacelet(sc.cube); startCube = sc.cube; solution = []; solutionStages = []; cursor = 0; setCube(sc.cube); window.sessionStorage.setItem("cubelab-scramble", sc.alg); })]), output);
  return c;
}
function buildExplorer() {
  const c = h("section", { class: "card" });
  const chart = h("div", { class: "explorer-chart", id: "explorer-chart", "aria-label": "Search depth and heuristic samples" });
  const tree = h("div", { class: "tree-samples", id: "tree-samples" });
  const summary = h("p", { id: "explorer-status", role: "status", class: "subtle" }, ["Ready to inspect a search."]);
  c.append(h("div", { class: "row" }, [button("Start IDA* exploration", () => {
    chart.replaceChildren(); tree.replaceChildren(); const samples: SolverProgress[] = [];
    activeJob?.cancel(); activeJob = runSolve("ida-pdb", cube, { timeoutMs: 30000, maxDepth: 8, progressInterval: 1000 }, { onBuilding: (t) => { summary.textContent = `Building ${t}…`; }, onProgress: (p) => { samples.push(p); summary.textContent = `Threshold ${p.threshold ?? "—"} · g=${p.g ?? "—"} · h=${p.h ?? "—"} · ${p.nodesExpanded.toLocaleString()} nodes`; const sample = h("div", { class: "chart-sample", title: `g ${p.g ?? 0}, h ${p.h ?? 0}` }); const gBar = h("span", { class: "chart-bar g-bar" }); const hBar = h("span", { class: "chart-bar h-bar" }); gBar.style.height = `${Math.max(4, Math.min(100, (p.g ?? 0) * 10))}%`; hBar.style.height = `${Math.max(4, Math.min(100, (p.h ?? 0) * 10))}%`; sample.append(gBar, hBar); chart.append(sample); if (samples.length < 24) { const level = Math.min(6, p.g ?? 0); const node = h("span", { class: "tree-node", title: `sampled depth ${level}; h=${p.h ?? 0}` }, [`g${level} · h${p.h ?? 0}`]); node.style.marginLeft = `${level * 14}px`; tree.append(node); } } }); activeJob.promise.then((r) => { summary.textContent = `${r.solved ? "Solved" : "Search ended"} · ${r.stats.nodesExpanded.toLocaleString()} nodes · ${r.stats.timeMs.toFixed(0)} ms`; }).catch((e) => { summary.textContent = e.message; });
  }), button("Cancel search", () => activeJob?.cancel())]), summary, chart, h("small", { class: "subtle" }, ["Each bar samples g(n)+h(n); compact labels show g/h samples. The engine emits throttled telemetry."]), tree);
  return c;
}
function buildLab() {
  const c = h("section", { class: "card" });
  const out = h("div", { class: "stack" });
  const corners = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  const edges = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  c.append(h("div", { class: "row" }, [h("label", {}, [corners, " Corner pattern database"]), h("label", {}, [edges, " Edge orientation table"])]), h("p", { class: "subtle" }, ["Toggle either admissible pattern database and compare against the other selection. Each run uses the same cube and an 8-move optimal-search cap."]), h("div", { class: "row" }, [button("Compare heuristic", () => { out.replaceChildren(); for (const [name, heuristic] of [["Selected tables", { corners: corners.checked, edgeOrientation: edges.checked }], ["Both tables", { corners: true, edgeOrientation: true }]] as const) { const row = h("div", { class: "stat" }, [h("div", { class: "k" }, [name]), h("div", { class: "v" }, ["Building / searching…"])]); out.append(row); runSolve("ida-pdb", cube, { timeoutMs: 30000, maxDepth: 8, heuristic }, {}).promise.then((r) => { row.querySelector(".v")!.textContent = `${r.stats.nodesExpanded.toLocaleString()} nodes · ${r.stats.timeMs.toFixed(1)} ms${r.solved ? ` · ${r.stats.solutionLength} moves` : r.timedOut ? " · capped" : ""}`; }).catch((e) => { row.querySelector(".v")!.textContent = e.message; }); } })]), out);
  return c;
}
function buildDoctor() {
  const c = h("section", { class: "card" });
  const feedback = h("p", { class: "subtle" }, ["Checking current painted stickers…"]);
  const fixes = h("ul", {});
  const validate = () => {
    const v = validateFacelets(painterColors);
    feedback.textContent = v.ok ? "This sticker arrangement describes a reachable cube." : v.message;
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
  c.append(feedback, fixes, button("Check current painted state", validate));
  queueMicrotask(validate);
  return c;
}
function buildLearn() {
  const c = h("section", { class: "card" });
  const info = h("p", { class: "subtle", id: "learn-hint" }, ["Solve first, then request the next hint."]);
  learnHint = info;
  const faces = h("div", { class: "row", "aria-label": "Try a face turn" });
  for (const f of [Face.U, Face.D, Face.L, Face.R, Face.F, Face.B]) {
    faces.append(button(FACE_NAMES[f], () => commitTurn(f, 1), false, `Try ${FACE_NAMES[f]} clockwise`), button(`${FACE_NAMES[f]}'`, () => commitTurn(f, 3), false, `Try ${FACE_NAMES[f]} counter-clockwise`));
  }
  c.append(info, h("div", { class: "row" }, [button("Solve for hints", () => { learnStep = 0; solveNow(); }), button("Reveal expected move", () => { if (!solution.length) { info.textContent = "No solution loaded yet. Solve this cube first."; return; } info.textContent = `Hint ${learnStep + 1}/${solution.length}: try ${MOVES[solution[learnStep]!]!.name} using the keyboard or face buttons.`; })]), faces);
  return c;
}
function buildBench() {
  const c = h("section", { class: "card" });
  type Aggregate = { solver: string; depth: string; count: number; successRate: number; avgLength: number; avgTimeMs: number; avgNodes: number };
  const table = h("div", { class: "bench-placeholder" });
  const input = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Load benchmark JSON" }) as HTMLInputElement;
  const renderRows = (aggs: Aggregate[]) => table.replaceChildren(...aggs.map((a) => h("div", { class: "bench-row" }, [`${a.solver} · ${a.depth}: ${(a.successRate * a.count).toFixed(0)}/${a.count} solved · ${a.avgLength.toFixed(2)} moves · ${a.avgTimeMs.toFixed(2)} ms · ${a.avgNodes.toFixed(0)} nodes`])));
  renderRows((benchmarkData.aggregates ?? []) as Aggregate[]);
  input.onchange = async () => { const file = input.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()) as { aggregates?: Aggregate[] }; if (!Array.isArray(data.aggregates)) throw Error("Missing aggregates array"); renderRows(data.aggregates); toast(`Loaded ${data.aggregates.length} benchmark groups`); } catch (e) { toast(`Could not load benchmark JSON: ${(e as Error).message}`); } };
  const download = button("Download current results JSON", () => { const blob = new Blob([JSON.stringify(benchmarkData, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "cubelab-benchmark-results.json"; a.click(); URL.revokeObjectURL(url); });
  c.append(h("div", { class: "row" }, [input, download]), h("p", { class: "subtle" }, ["This dashboard displays the bundled measured dataset or a JSON file from another benchmark run. Full methodology and limitations: docs/BENCHMARK_ANALYSIS.md."]), table);
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
  const viewEl = h("div", { class: "view rise" }, [pageHeader(activeTab), views[activeTab]!()]);
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
