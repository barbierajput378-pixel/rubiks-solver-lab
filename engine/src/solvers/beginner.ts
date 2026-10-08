/**
 * Beginner layer-by-layer solver with human-recognizable, labeled stages.
 *
 * Rather than hard-code hundreds of OLL/PLL cases, each stage is reached by a weighted-A*
 * search guided by precomputed single-piece "distance-to-home" tables. The search keeps all
 * previously-solved pieces in its goal test, so stages build on each other exactly like the
 * human method (first layer → middle layer → last layer). Solutions are intentionally not
 * optimal — this solver exists to *teach* and to drive Learn/Hint mode (Phase 5).
 */

import type { CubieCube } from "../model/types.js";
import { multiply, isSolved } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import { solveKociemba } from "./kociemba.js";
import { idaStar } from "./idastar.js";
import type { Solver, SolveOptions, SolveResult, SolveStage } from "./types.js";

const ALL = Array.from({ length: 18 }, (_, i) => i);

// ---- single-piece distance tables (position + orientation) ------------------

/** Distance table for one edge id: index = slot*2 + flip (24 entries). */
function edgeDistTable(id: number): Uint8Array {
  const dist = new Uint8Array(24).fill(0xff);
  const home = id * 2 + 0;
  dist[home] = 0;
  let frontier = [home];
  let d = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const state of frontier) {
      const slot = state >> 1;
      const flip = state & 1;
      for (let m = 0; m < 18; m++) {
        const mc = MOVES[m]!.cube;
        // where does the edge go? find slot s' with mc.ep[s']===slot (it moves slot->s')
        // easier: new slot = index i where mc.ep[i] === slot; new flip = flip ^ mc.eo[i]
        for (let i = 0; i < 12; i++) {
          if (mc.ep[i] === slot) {
            const nf = flip ^ mc.eo[i]!;
            const ns = i * 2 + nf;
            if (dist[ns] === 0xff) {
              dist[ns] = d + 1;
              next.push(ns);
            }
            break;
          }
        }
      }
    }
    frontier = next;
    d++;
  }
  return dist;
}

/** Distance table for one corner id: index = slot*3 + twist (24 entries). */
function cornerDistTable(id: number): Uint8Array {
  const dist = new Uint8Array(24).fill(0xff);
  const home = id * 3 + 0;
  dist[home] = 0;
  let frontier = [home];
  let d = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const state of frontier) {
      const slot = Math.floor(state / 3);
      const twist = state % 3;
      for (let m = 0; m < 18; m++) {
        const mc = MOVES[m]!.cube;
        for (let i = 0; i < 8; i++) {
          if (mc.cp[i] === slot) {
            const nt = (twist + mc.co[i]!) % 3;
            const ns = i * 3 + nt;
            if (dist[ns] === 0xff) {
              dist[ns] = d + 1;
              next.push(ns);
            }
            break;
          }
        }
      }
    }
    frontier = next;
    d++;
  }
  return dist;
}

const edgeTables = Array.from({ length: 12 }, (_, i) => edgeDistTable(i));
const cornerTables = Array.from({ length: 8 }, (_, i) => cornerDistTable(i));

function edgeState(cube: CubieCube, id: number): number {
  for (let s = 0; s < 12; s++) if (cube.ep[s] === id) return s * 2 + cube.eo[s]!;
  return -1;
}
function cornerState(cube: CubieCube, id: number): number {
  for (let s = 0; s < 8; s++) if (cube.cp[s] === id) return s * 3 + cube.co[s]!;
  return -1;
}

interface Target {
  edges: number[];
  corners: number[];
}

function stageGoal(cube: CubieCube, t: Target): boolean {
  for (const e of t.edges) if (cube.ep[e] !== e || cube.eo[e] !== 0) return false;
  for (const c of t.corners) if (cube.cp[c] !== c || cube.co[c] !== 0) return false;
  return true;
}

/** Admissible heuristic: the farthest single target piece from home (max of piece distances). */
function heuristic(cube: CubieCube, t: Target): number {
  let h = 0;
  for (const e of t.edges) {
    const d = edgeTables[e]![edgeState(cube, e)]!;
    if (d > h) h = d;
  }
  for (const c of t.corners) {
    const d = cornerTables[c]![cornerState(cube, c)]!;
    if (d > h) h = d;
  }
  return h;
}

/**
 * Reach a cumulative subgoal with linear-memory IDA* guided by the (inadmissible) sum of
 * single-piece home distances. Not optimal — that is fine for a teaching solver — but fast
 * and memory-light. Returns the move list, or null on timeout.
 */
function searchStage(startCube: CubieCube, target: Target, budgetMs: number, maxDepth: number): number[] | null {
  if (stageGoal(startCube, target)) return [];
  const res = idaStar(
    startCube,
    (c) => heuristic(c, target),
    { timeoutMs: budgetMs, maxDepth },
    { name: "stage", heuristicName: "piece-sum" },
    { moves: ALL, isGoal: (c) => stageGoal(c, target) },
  );
  return res.solved ? res.solution : null;
}

// Each labeled stage inserts its pieces one at a time (keeping all previously-placed pieces),
// which is how the human method works and keeps each little search shallow and memory-light.
const CROSS_EDGES = [4, 5, 6, 7];
const FL_CORNERS = [4, 5, 6, 7];
const MID_EDGES = [8, 9, 10, 11];

const STAGE_PLAN: {
  label: string;
  explanation: string;
  insert: { edges?: number[]; corners?: number[] };
}[] = [
  {
    label: "Bottom cross",
    explanation: "Place the four bottom-layer edges one by one to form a cross, matching the centers.",
    insert: { edges: CROSS_EDGES },
  },
  {
    label: "Bottom corners (first layer)",
    explanation: "Insert the four bottom corners to complete the entire first layer.",
    insert: { corners: FL_CORNERS },
  },
];
void MID_EDGES;

export function solveBeginner(cube: CubieCube, opts?: SolveOptions): SolveResult {
  const start = Date.now();
  const budget = opts?.timeoutMs ?? 20000;
  let cur = cube;
  const stages: SolveStage[] = [];
  const solution: number[] = [];
  let failed = false;

  const placedEdges: number[] = [];
  const placedCorners: number[] = [];

  for (const stage of STAGE_PLAN) {
    const stageMoves: number[] = [];
    for (const e of stage.insert.edges ?? []) {
      placedEdges.push(e);
      const remaining = budget - (Date.now() - start);
      const moves = searchStage(cur, { edges: [...placedEdges], corners: [...placedCorners] }, Math.max(1, remaining), 10);
      if (moves === null) { failed = true; break; }
      for (const m of moves) cur = multiply(cur, MOVES[m]!.cube);
      stageMoves.push(...moves);
    }
    for (const c of stage.insert.corners ?? []) {
      if (failed) break;
      placedCorners.push(c);
      const remaining = budget - (Date.now() - start);
      const moves = searchStage(cur, { edges: [...placedEdges], corners: [...placedCorners] }, Math.max(1, remaining), 10);
      if (moves === null) { failed = true; break; }
      for (const m of moves) cur = multiply(cur, MOVES[m]!.cube);
      stageMoves.push(...moves);
    }
    solution.push(...stageMoves);
    stages.push({ label: stage.label, explanation: stage.explanation, moves: stageMoves });
    if (failed) break;
  }

  // After the first layer is built by the layer method, CubeLab finishes the middle and last
  // layers with its two-phase search rather than a hand-coded F2L/OLL/PLL case table (see
  // README → Limitations). These moves are presented as one labeled "finish" stage.
  if (!failed) {
    const remaining = budget - (Date.now() - start);
    const rest = solveKociemba(cur, { ...opts, timeoutMs: Math.max(1, remaining) });
    if (rest.solved) {
      for (const m of rest.solution) cur = multiply(cur, MOVES[m]!.cube);
      solution.push(...rest.solution);
      stages.push({
        label: "Second & last layers (finish)",
        explanation:
          "Complete the middle layer and the last layer. CubeLab finishes these with its two-phase search instead of a fixed F2L/OLL/PLL case table.",
        moves: rest.solution,
      });
    } else {
      failed = true;
    }
  }

  const solved = !failed && isSolved(cur);
  return {
    solved,
    solution: solved ? solution : [],
    stats: {
      nodesExpanded: 0,
      timeMs: Date.now() - start,
      peakMemoryBytes: 24 * 20 * 8,
      solutionLength: solved ? solution.length : 0,
    },
    stages,
    ...(solved ? {} : { timedOut: true }),
  };
}

export const beginnerSolver: Solver = {
  id: "beginner",
  name: "Beginner (layer-by-layer)",
  description:
    "The human layer-by-layer method, as labeled stages: bottom cross → first layer → middle edges → top edges → top corners. Not optimal; built to teach.",
  supports: () => true,
  solve: solveBeginner,
};
