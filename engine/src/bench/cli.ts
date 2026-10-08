/**
 * cubelab-bench — benchmark harness for the CubeLab solvers.
 *
 * Usage:
 *   cubelab-bench --solvers all --scrambles 50 --depths 5,10,15,20,random --seed 42 \
 *                 --timeout 10000 --out bench-out --plots docs/benchmarks
 *
 * Honesty (per spec): the optimal IDA* solver is NOT run on deep/random 3×3 states — that is
 * exponential. It is capped at --maxOptimalDepth (default 8) and skipped for "random". Every
 * run is verified against the model, and only measured numbers are reported.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { multiply, isSolved } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import { randomScramble, uniformRandomState, makeRng } from "../model/random.js";
import { solvedCube } from "../model/cubie.js";
import type { CubieCube } from "../model/types.js";
import { SOLVERS } from "../solvers/index.js";
import { buildKociembaTables } from "../solvers/kociemba.js";
import { buildOptimalTables } from "../solvers/optimal.js";
import { groupedBarChart, scatterChart, type Series } from "./svg.js";

interface Args {
  solvers: string[];
  scrambles: number;
  depths: string[];
  seed: number;
  timeout: number;
  out: string;
  plots: string;
  maxOptimalDepth: number;
}

function parseArgs(argv: string[]): Args {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) m.set(a.slice(2, eq), a.slice(eq + 1));
      else {
        m.set(a.slice(2), argv[i + 1] ?? "");
        i++;
      }
    }
  }
  const solversArg = m.get("solvers") ?? "all";
  const all3x3 = ["kociemba", "thistlethwaite", "beginner", "ida-pdb"];
  const all2x2 = ["bibfs-2x2", "bfs-2x2"];
  const solvers =
    solversArg === "all" ? [...all3x3, ...all2x2] : solversArg.split(",").map((s) => s.trim());
  return {
    solvers,
    scrambles: parseInt(m.get("scrambles") ?? "50", 10),
    depths: (m.get("depths") ?? "5,10,15,20,random").split(",").map((s) => s.trim()),
    seed: parseInt(m.get("seed") ?? "42", 10),
    timeout: parseInt(m.get("timeout") ?? "10000", 10),
    out: m.get("out") ?? "bench-out",
    plots: m.get("plots") ?? "docs/benchmarks",
    maxOptimalDepth: parseInt(m.get("maxOptimalDepth") ?? "8", 10),
  };
}

const PUZZLE_OF: Record<string, "2x2" | "3x3"> = {
  "bibfs-2x2": "2x2",
  "bfs-2x2": "2x2",
  kociemba: "3x3",
  thistlethwaite: "3x3",
  beginner: "3x3",
  "ida-pdb": "3x3",
};

/** Build a scramble for the given puzzle and depth category. */
function makeScramble(puzzle: "2x2" | "3x3", depth: string, seed: number): CubieCube {
  if (puzzle === "2x2") {
    // corner scramble using only U,R,F families (moves 0..8)
    const n = depth === "random" ? 50 : parseInt(depth, 10);
    const rng = makeRng(seed);
    let c = solvedCube();
    let prev = -1;
    let placed = 0;
    while (placed < n) {
      const mv = Math.floor(rng() * 9);
      if (Math.floor(mv / 3) === prev) continue;
      c = multiply(c, MOVES[mv]!.cube);
      prev = Math.floor(mv / 3);
      placed++;
    }
    return c;
  }
  if (depth === "random") return uniformRandomState(seed);
  return randomScramble(parseInt(depth, 10), seed).cube;
}

interface Run {
  solver: string;
  puzzle: string;
  depth: string;
  seed: number;
  solved: boolean;
  timedOut: boolean;
  length: number;
  timeMs: number;
  nodes: number;
  peakMemory: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function solvedCorners(cube: CubieCube): boolean {
  for (let i = 0; i < 8; i++) if (cube.cp[i] !== i || cube.co[i] !== 0) return false;
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("cubelab-bench", JSON.stringify(args));

  console.log("building solver tables…");
  buildKociembaTables();
  if (args.solvers.includes("ida-pdb")) buildOptimalTables((p) => console.log("  pdb:", p.name, p.done ? "done" : "…"));

  const runs: Run[] = [];
  for (const solverId of args.solvers) {
    const solver = SOLVERS[solverId];
    if (!solver) {
      console.warn("unknown solver:", solverId);
      continue;
    }
    const puzzle = PUZZLE_OF[solverId] ?? "3x3";
    for (const depth of args.depths) {
      // honesty cap: don't run optimal IDA* on deep/random 3×3
      if (solverId === "ida-pdb") {
        if (depth === "random") continue;
        if (parseInt(depth, 10) > args.maxOptimalDepth) continue;
      }
      // plain unidirectional BFS on 2×2 is only tractable on shallow states — cap it too
      if (solverId === "bfs-2x2") {
        if (depth === "random") continue;
        if (parseInt(depth, 10) > 8) continue;
      }
      process.stdout.write(`  ${solverId} @ depth ${depth}: `);
      let done = 0;
      for (let i = 0; i < args.scrambles; i++) {
        const seed = args.seed + i * 1009 + depth.length * 31;
        const cube = makeScramble(puzzle, depth, seed);
        const res = solver.solve(cube, {
          timeoutMs: args.timeout,
          ...(solverId === "ida-pdb" ? { maxDepth: 20 } : {}),
        });
        // verify
        let c = cube;
        for (const mv of res.solution) c = multiply(c, MOVES[mv]!.cube);
        const ok = puzzle === "2x2" ? solvedCorners(c) : isSolved(c);
        runs.push({
          solver: solverId,
          puzzle,
          depth,
          seed,
          solved: res.solved && ok,
          timedOut: !!res.timedOut,
          length: res.solved && ok ? res.solution.length : -1,
          timeMs: res.stats.timeMs,
          nodes: res.stats.nodesExpanded,
          peakMemory: res.stats.peakMemoryBytes,
        });
        done++;
      }
      console.log(`${done} runs`);
    }
  }

  // aggregate
  const groups = new Map<string, Run[]>();
  for (const r of runs) {
    const key = `${r.solver}|${r.depth}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const aggregates = [...groups.entries()].map(([key, rs]) => {
    const [solver, depth] = key.split("|");
    const solvedRuns = rs.filter((r) => r.solved);
    const lengths = solvedRuns.map((r) => r.length);
    const times = solvedRuns.map((r) => r.timeMs);
    const nodes = solvedRuns.map((r) => r.nodes);
    return {
      solver,
      depth,
      puzzle: rs[0]!.puzzle,
      count: rs.length,
      successRate: solvedRuns.length / rs.length,
      timeoutRate: rs.filter((r) => r.timedOut).length / rs.length,
      avgLength: round(mean(lengths)),
      medianLength: round(median(lengths)),
      avgTimeMs: round(mean(times)),
      medianTimeMs: round(median(times)),
      avgNodes: round(mean(nodes)),
      avgPeakMemoryBytes: round(mean(solvedRuns.map((r) => r.peakMemory))),
    };
  });

  // write outputs
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const report = { config: args, generatedAt: new Date().toISOString(), aggregates };
  writeFileSync(resolve(outDir, "results.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(outDir, "results.csv"), toCsv(runs));

  // summary.json for the in-app dashboard (Phase 5)
  const plotsDir = resolve(args.plots);
  mkdirSync(plotsDir, { recursive: true });
  writeFileSync(resolve(plotsDir, "summary.json"), JSON.stringify(report, null, 2));

  // plots (3×3 solvers, numeric depths)
  const solvers3x3 = args.solvers.filter((s) => (PUZZLE_OF[s] ?? "3x3") === "3x3");
  const numericDepths = args.depths.filter((d) => d !== "random");
  const mkSeries = (field: "avgLength" | "avgTimeMs" | "avgNodes"): Series[] =>
    solvers3x3.map((s) => ({
      name: s,
      values: numericDepths.map((d) => aggregates.find((a) => a.solver === s && a.depth === d)?.[field] ?? NaN),
    }));

  writeFileSync(
    resolve(plotsDir, "length-by-depth.svg"),
    groupedBarChart({ title: "Average solution length by scramble depth (3×3)", categories: numericDepths, series: mkSeries("avgLength"), yLabel: "moves" }),
  );
  writeFileSync(
    resolve(plotsDir, "time-by-depth.svg"),
    groupedBarChart({ title: "Average solve time by scramble depth (3×3)", categories: numericDepths, series: mkSeries("avgTimeMs"), yLabel: "ms (log)", logScale: true }),
  );
  writeFileSync(
    resolve(plotsDir, "nodes-by-depth.svg"),
    groupedBarChart({ title: "Average nodes expanded by scramble depth (3×3)", categories: numericDepths, series: mkSeries("avgNodes"), yLabel: "nodes (log)", logScale: true }),
  );
  const scatterPoints = runs
    .filter((r) => r.solved && (PUZZLE_OF[r.solver] ?? "3x3") === "3x3")
    .map((r) => ({ x: r.length, y: Math.max(r.timeMs, 0.1), group: r.solver }));
  writeFileSync(
    resolve(plotsDir, "length-vs-time.svg"),
    scatterChart({ title: "Solution length vs solve time (3×3)", points: scatterPoints, xLabel: "solution length (moves)", yLabel: "time (ms)" }),
  );

  console.log(`\nWrote ${runs.length} runs → ${outDir}/results.{json,csv}`);
  console.log(`Plots + summary.json → ${plotsDir}`);
  console.table(
    aggregates.map((a) => ({
      solver: a.solver,
      depth: a.depth,
      success: (a.successRate * 100).toFixed(0) + "%",
      avgLen: a.avgLength,
      medLen: a.medianLength,
      avgMs: a.avgTimeMs,
      avgNodes: a.avgNodes,
    })),
  );
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function toCsv(runs: Run[]): string {
  const header = "solver,puzzle,depth,seed,solved,timedOut,length,timeMs,nodes,peakMemory";
  const lines = runs.map((r) =>
    [r.solver, r.puzzle, r.depth, r.seed, r.solved, r.timedOut, r.length, r.timeMs, r.nodes, r.peakMemory].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
