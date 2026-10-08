import "./styles/app.css";
import {
  Face, FACE_NAMES, MOVES, SOLVER_LIST, SOLVED_FACELETS, applyMoveIndex,
  cubieToFacelet, randomScramble, uniformRandomState, solvedCube, validateFacelets,
} from "@cubelab/engine";
import type { CubieCube, FaceletCube, SolveStage, SolverProgress } from "@cubelab/engine";
import { CubeView } from "./cube3d/CubeView";
import { runSolve } from "./engine/solverClient";
import { buildScanner } from "./scanner/scanner";
import benchmarkData from "../../bench-out/results.json";
import { h, toast } from "./ui/dom";

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
let activeJob: ReturnType<typeof runSolve> | undefined;
let currentView: CubeView;
let progressText = "Ready";
let painterColors: FaceletCube = SOLVED_FACELETS.slice();
let activeTab = "solve";
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
header.append(h("div", { class: "brand", "aria-label": "CubeLab home" }, [h("span", { class: "logo", "aria-hidden": "true" }, ["◈"]), h("span", {}, ["CubeLab", h("small", {}, ["  /  algorithm lab"])])]));
header.append(h("div", { class: "spacer" }));
const themeButton = h("button", { class: "btn ghost", type: "button", "aria-label": "Toggle light and dark theme" }, ["◐ Theme"]);
themeButton.onclick = () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("cubelab-theme", theme); currentView?.readThemeColors(); };
header.append(themeButton);
const cbButton = h("button", { class: "btn ghost", type: "button", "aria-label": "Toggle colorblind-safe cube colors" }, ["◉ Palette"]);
cbButton.onclick = () => { const cb = document.documentElement.dataset.cb === "on" ? "off" : "on"; document.documentElement.dataset.cb = cb; localStorage.setItem("cubelab-cb", cb); currentView?.readThemeColors(); };
header.append(cbButton);
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
function commitTurn(face: Face, power: 1 | 2 | 3) {
  if (currentView?.isAnimating) return;
  const idx = MOVES.findIndex((m) => m.face === face && m.power === power);
  if (idx >= 0) {
    void currentView.turn(face, power, true);
    cube = applyMoveIndex(cube, idx);
    solution = []; cursor = 0;
    updateHash(); renderPlayback();
  }
}
function solveNow() {
  activeJob?.cancel();
  startCube = cube; solution = []; cursor = 0;
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
    solution = result.solution.slice(); solutionStages = result.stages ?? []; cursor = 0; progressText = `${result.solution.length} moves · ${result.stats.timeMs.toFixed(1)} ms`;
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
  if (stages) stages.replaceChildren(...solutionStages.map((s) => h("div", { class: "stage-note" }, [h("strong", {}, [s.label]), h("span", {}, [s.explanation])])));
}
function seek(n: number) {
  cursor = Math.max(0, Math.min(solution.length, n));
  let c = { cp: startCube.cp.slice(), co: startCube.co.slice(), ep: startCube.ep.slice(), eo: startCube.eo.slice() };
  for (let i = 0; i < cursor; i++) c = applyMoveIndex(c, solution[i]!);
  cube = c; currentView.setCube(cube); renderPlayback();
}
function buildSolveView() {
  const layout = h("div", { class: "layout" });
  const left = h("div", { class: "stack" });
  const stageCard = card("Cube", "Drag the background to orbit · U D L R F B keys turn faces · Shift reverses");
  const stage = h("div", { class: "stage", role: "application", "aria-label": "Interactive 3D Rubik's Cube" });
  stageCard.append(stage); left.append(stageCard);
  const playback = card("Solution playback", "Scrub or select a move to inspect the solution.");
  const controls = h("div", { class: "row" });
  controls.append(button("⏮", () => seek(cursor - 1), false, "Step back"), button("▶ / ❚❚", () => { if (playTimer) { clearInterval(playTimer); playTimer = undefined; } else playTimer = window.setInterval(() => { if (cursor >= solution.length) { clearInterval(playTimer); playTimer = undefined; return; } seek(cursor + 1); }, 650 / settings.speed); }, false, "Play or pause solution"), button("⏭", () => seek(cursor + 1), false, "Step forward"));
  const range = h("input", { id: "playback-range", type: "range", min: "0", max: "0", value: "0", "aria-label": "Scrub solution playback" }) as HTMLInputElement;
  range.oninput = () => seek(Number(range.value));
  const speed = h("label", { class: "field" }, ["Playback speed", h("input", { type: "range", min: "0.5", max: "2", step: "0.25", value: "1", "aria-label": "Playback speed" })]);
  (speed.querySelector("input") as HTMLInputElement).oninput = (e) => { settings.speed = Number((e.target as HTMLInputElement).value); };
  const list = h("div", { class: "moves", id: "move-list", "aria-label": "Solution moves" });
  playback.append(controls, range, speed, h("div", { id: "playback-status", class: "subtle" }, ["0 / 0 moves"]), list, h("div", { id: "solution-stages", class: "stage-notes" })); left.append(playback);
  const right = h("div", { class: "stack" });
  const actions = card("Solve a cube", "Choose a solver, then explore the returned algorithm move by move.");
  const solver = h("select", { id: "solver-select", "aria-label": "Solver" });
  for (const s of SOLVER_LIST) solver.append(h("option", { value: s.id }, [`${s.name}${s.id.includes("2x2") ? " (2×2)" : ""}`]));
  solver.value = settings.solver; solver.onchange = () => { settings.solver = solver.value; };
  const status = h("div", { id: "solve-status", role: "status", "aria-live": "polite", class: "subtle" }, [progressText]);
  const meter = h("div", { class: "meter", id: "solve-meter", role: "progressbar", "aria-label": "Solver progress" }, [h("span")]);
  const scramble = button("⤨ Scramble", () => {
    const sc = randomScramble(20, Math.floor(Math.random() * 0xffffffff)); const next = sc.cube; startCube = next; solution = []; cursor = 0; setCube(next);
    window.sessionStorage.setItem("cubelab-scramble", sc.alg); progressText = `Scramble: ${sc.alg}`; render();
  });
  const solveButton = button("⚡ Solve", solveNow, true);
  const reset = button("↺ Reset", () => { activeJob?.cancel(); activeJob = undefined; solution = []; cursor = 0; startCube = solvedCube(); setCube(solvedCube()); window.sessionStorage.removeItem("cubelab-scramble"); render(); });
  const copyLink = button("↗ Share link", () => { updateHash(); void navigator.clipboard?.writeText(location.href).then(() => toast("Share link copied")).catch(() => toast("Copy the link from the address bar")); });
  actions.append(h("div", { class: "row" }, [solver]), h("div", { class: "row" }, [scramble, solveButton, reset, copyLink]), meter, status); right.append(actions);
  const keys = card("Keyboard moves", "Press a face key to turn clockwise; hold Shift for counter-clockwise.");
  keys.append(h("p", { class: "subtle" }, ["U · D · L · R · F · B"])); right.append(keys);
  const painter = card("Manual color painter", "Click a sticker tile to cycle its color. The center stickers stay fixed.");
  painterColors = cubieToFacelet(cube);
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
  painter.append(grid, validity, h("div", { class: "row" }, [button("Use painted cube", () => { const v = validateFacelets(painterColors); if (!v.ok || !v.cube) { validatePaint(); return; } startCube = v.cube; setCube(v.cube); toast("Painted cube loaded"); }), button("Clear to solved", () => { painterColors = SOLVED_FACELETS.slice(); render(); })])); right.append(painter);
  layout.append(left, right);
  queueMicrotask(() => {
    if (!stage.isConnected) return;
    currentView = new CubeView(stage, { reducedMotion }); currentView.setCube(cube);
    currentView.onMove = commitTurn;
    renderPlayback();
  });
  return layout;
}
let playTimer: number | undefined;

function buildRace() {
  const c = card("Solver race", "Run several implementations at once in isolated workers. First correct completion wins.");
  const checks = h("div", { class: "race-options" });
  const defaults = ["kociemba", "thistlethwaite", "beginner", "ida-pdb"];
  for (const s of SOLVER_LIST.filter((x) => !x.id.includes("2x2"))) checks.append(h("label", {}, [h("input", { type: "checkbox", value: s.id, checked: defaults.includes(s.id) }), ` ${s.name}`]));
  const output = h("div", { id: "race-results", class: "stack" });
  c.append(checks, h("div", { class: "row" }, [button("Start race", () => {
    output.replaceChildren();
    const selected = [...checks.querySelectorAll<HTMLInputElement>("input:checked")].map((x) => x.value);
    if (selected.length < 2 || selected.length > 4) { toast("Select 2–4 solvers"); return; }
    const jobs = selected.map((id) => {
      const row = h("div", { class: "race-row" }); const title = SOLVER_LIST.find((x) => x.id === id)!.name;
      const stats = h("span", { class: "subtle" }, ["Starting…"]); const bar = h("div", { class: "meter" }, [h("span")]); row.append(h("strong", {}, [title]), stats, bar); output.append(row);
      const startedAt = performance.now(); let liveNodes = 0; let liveDepth = 0; let finished = false;
      const clock = window.setInterval(() => { if (!finished) stats.textContent = `${liveNodes.toLocaleString()} nodes${liveDepth ? ` · depth ${liveDepth}` : ""} · ${(performance.now() - startedAt).toFixed(0)} ms`; }, 250);
      const job = runSolve(id, cube, { timeoutMs: 30000, progressInterval: 25000 }, { onProgress: (p) => { liveNodes = p.nodesExpanded; liveDepth = p.threshold ?? p.g ?? 0; stats.textContent = `${p.nodesExpanded.toLocaleString()} nodes${p.threshold == null ? "" : ` · depth ${p.threshold}`} · ${p.phase ?? "searching"}`; (bar.firstElementChild as HTMLElement).style.width = `${Math.min(95, Math.log10(p.nodesExpanded + 1) * 15)}%`; }, onBuilding: (t) => { stats.textContent = `Building ${t}…`; } });
      job.promise.then((r) => { finished = true; clearInterval(clock); stats.textContent = r.solved ? `${r.stats.solutionLength} moves · ${r.stats.timeMs.toFixed(0)} ms` : r.timedOut ? "Timed out" : "No solution"; (bar.firstElementChild as HTMLElement).style.width = r.solved ? "100%" : "0%"; if (r.solved && !output.dataset.winner) { output.dataset.winner = id; row.classList.add("winner"); toast(`${title} wins the race!`); } }).catch((e) => { finished = true; clearInterval(clock); stats.textContent = `Error: ${e.message}`; });
      return job;
    });
  }), button("Race a new scramble", () => { const sc = randomScramble(20, Math.floor(Math.random() * 0xffffffff)); setCube(sc.cube); window.sessionStorage.setItem("cubelab-scramble", sc.alg); })]), output);
  return c;
}
function buildExplorer() {
  const c = card("Search explorer", "Stream IDA* thresholds and heuristic telemetry from the optimal-search worker.");
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
  const c = card("Heuristic lab", "Compare search cost for one scramble with the available optimal-search heuristic configuration.");
  const out = h("div", { class: "stack" });
  const corners = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  const edges = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  c.append(h("div", { class: "row" }, [h("label", {}, [corners, " Corner pattern database"]), h("label", {}, [edges, " Edge orientation table"])]), h("p", { class: "subtle" }, ["Toggle either admissible pattern database and compare against the other selection. Each run uses the same cube and an 8-move optimal-search cap."]), h("div", { class: "row" }, [button("Compare heuristic", () => { out.replaceChildren(); for (const [name, heuristic] of [["Selected tables", { corners: corners.checked, edgeOrientation: edges.checked }], ["Both tables", { corners: true, edgeOrientation: true }]] as const) { const row = h("div", { class: "stat" }, [h("div", { class: "k" }, [name]), h("div", { class: "v" }, ["Building / searching…"])]); out.append(row); runSolve("ida-pdb", cube, { timeoutMs: 30000, maxDepth: 8, heuristic }, {}).promise.then((r) => { row.querySelector(".v")!.textContent = `${r.stats.nodesExpanded.toLocaleString()} nodes · ${r.stats.timeMs.toFixed(1)} ms${r.solved ? ` · ${r.stats.solutionLength} moves` : r.timedOut ? " · capped" : ""}`; }).catch((e) => { row.querySelector(".v")!.textContent = e.message; }); } })]), out);
  return c;
}
function buildDoctor() {
  const c = card("Smart validity doctor", "Painted stickers are checked against color counts, piece inventory, orientation and parity.");
  const feedback = h("p", { class: "subtle" }, ["The painter in Solve provides live feedback. Load a painted state to diagnose it here."]);
  const fixes = h("ul", {});
  const validate = () => { const v = validateFacelets(painterColors); feedback.textContent = v.ok ? "This sticker arrangement describes a reachable cube." : v.message; fixes.replaceChildren(); if (!v.ok) { const first = v.reasons[0]; fixes.append(h("li", {}, [first?.code === "BAD_COLOR_COUNT" ? "Suggested minimal fix: recolor one sticker on an over-counted face to a missing color, then validate again." : first?.code === "CORNER_TWIST" ? "Suggested fix: rotate one corner sticker set to restore the twist sum." : first?.code === "EDGE_FLIP" ? "Suggested fix: flip one edge sticker pair to restore the flip sum." : first?.code === "PERMUTATION_PARITY" ? "Suggested fix: swap two stickers on one edge or corner pair to correct parity." : "Suggested fix: inspect the reported corner or edge and restore its three/two legal colors."])); } };
  c.append(feedback, fixes, button("Check current painted state", validate));
  return c;
}
function buildLearn() {
  const c = card("Learn / hint mode", "Reveal one move at a time, with an explanation from the solver's named stages when available.");
  const info = h("p", { class: "subtle", id: "learn-hint" }, ["Solve first, then request the next hint."]);
  let step = 0;
  c.append(info, h("div", { class: "row" }, [button("Solve for hints", solveNow), button("Show next move", () => { if (!solution.length) { info.textContent = "No solution loaded yet. Solve this cube first."; return; } step = Math.min(step + 1, solution.length); info.textContent = `Hint ${step}/${solution.length}: turn ${MOVES[solution[step - 1]!]!.name}. Try it, then reveal the next move.`; }), button("Try this move", () => { if (step) commitTurn(MOVES[solution[step - 1]!]!.face, MOVES[solution[step - 1]!]!.power); })]));
  return c;
}
function buildBench() {
  const c = card("Benchmark dashboard", "Measurements from the committed Phase 3 run. Values are machine-dependent.");
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
  tabs.querySelectorAll("[role=tab]").forEach((t, i) => t.setAttribute("aria-selected", tabNames[i]![0] === activeTab ? "true" : "false"));
  content.replaceChildren();
  const views: Record<string, () => HTMLElement> = { solve: buildSolveView, race: buildRace, explorer: buildExplorer, lab: buildLab, doctor: buildDoctor, learn: buildLearn, scanner: buildScannerView, bench: buildBench };
  content.append(views[activeTab]!());
}
window.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
  if ("UDLRFB".includes(e.key.toUpperCase()) && e.key.length === 1) { const f = FACE_NAMES.indexOf(e.key.toUpperCase() as typeof FACE_NAMES[number]); if (f >= 0) commitTurn(f as Face, e.shiftKey ? 3 : 1); }
  if (e.key === "ArrowLeft" && solution.length) seek(cursor - 1);
  if (e.key === "ArrowRight" && solution.length) seek(cursor + 1);
});

const params = new URLSearchParams(location.hash.slice(1));
const initialAlg = params.get("s");
if (initialAlg && initialAlg !== "random state") {
    try { const names = initialAlg.trim().split(/\s+/).filter(Boolean); let c = solvedCube(); for (const name of names) { const i = MOVES.findIndex((m) => m.name === name); if (i < 0) throw Error("bad move"); c = applyMoveIndex(c, i); } cube = c; startCube = c; }
  catch { toast("Shared cube link was not valid; loaded solved cube."); }
}
const initialSolution = params.get("a");
if (initialSolution) {
  try { solution = initialSolution.trim().split(/\s+/).filter(Boolean).map((name) => { const i = MOVES.findIndex((m) => m.name === name); if (i < 0) throw Error("bad move"); return i; }); }
  catch { solution = []; toast("Shared solution was not valid; loaded the cube only."); }
}
render();
