/**
 * Thistlethwaite-style nested-group solver.
 *
 * The method descends a chain of subgroups, each reached using only the previous group's
 * moves, so each search is small:
 *   G0 = <U,D,L,R,F,B>  --P1-->  G1 = <U,D,L,R,F2,B2>   (all edges oriented)
 *   G1                   --P2-->  G2 = <U,D,L2,R2,F2,B2> (corners oriented + E-slice placed)
 *   G2                   --P3-->  solved                 (the "domino", only U,D + half turns)
 *
 * The classic 1981 method splits that last step into two phases (fix piece orbits, then
 * double turns only); CubeLab merges them into one optimal domino solve, which is a legitimate
 * and common simplification — documented in the README. Each phase is a labeled stage for the
 * Explainable-Solution UI.
 */

import type { CubieCube } from "../model/types.js";
import { multiply, isSolved } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import { buildEoMove, productBfs } from "./movetables.js";
import { idaStar } from "./idastar.js";
import { kociembaHeuristics, isG1, G1_MOVES } from "./kociemba.js";
import type { Solver, SolveOptions, SolveResult, SolveStage } from "./types.js";

// G1 moves (edges stay oriented): U, D, L, R (all turns) + F2, B2.
const THIST_G1_MOVES = [0, 1, 2, 9, 10, 11, 12, 13, 14, 3, 4, 5, 7, 16];
const ALL = Array.from({ length: 18 }, (_, i) => i);

let eoTable: Uint8Array | null = null;
function eoHeuristic(): (c: CubieCube) => number {
  if (!eoTable) {
    const eoMove = buildEoMove(ALL);
    // 1-D BFS over edge orientation: productBfs with a trivial second coordinate of size 1.
    // The second table still needs nm entries (all zero) since productBfs indexes [b*nm+mi].
    eoTable = productBfs(2048, eoMove, 1, new Int32Array(18), 18, 0);
  }
  const table = eoTable;
  return (c) => {
    let eo = 0;
    for (let i = 0; i < 11; i++) eo = eo * 2 + c.eo[i]!;
    return table[eo]!;
  };
}

function eoSolved(c: CubieCube): boolean {
  for (let i = 0; i < 12; i++) if (c.eo[i] !== 0) return false;
  return true;
}

export function solveThistlethwaite(cube: CubieCube, opts?: SolveOptions): SolveResult {
  const start = Date.now();
  const { g1, g2 } = kociembaHeuristics();
  const hEO = eoHeuristic();
  const budget = opts?.timeoutMs ?? 10000;

  const phases: { solution: number[]; nodes: number }[] = [];
  let cur = cube;

  const runPhase = (
    h: (c: CubieCube) => number,
    moves: number[],
    goal: (c: CubieCube) => boolean,
    maxDepth: number,
    name: string,
  ): boolean => {
    const remaining = budget - (Date.now() - start);
    const res = idaStar(
      cur,
      h,
      { ...opts, timeoutMs: Math.max(1, remaining), maxDepth },
      { name, heuristicName: name },
      { moves, isGoal: goal },
    );
    phases.push({ solution: res.solution, nodes: res.stats.nodesExpanded });
    if (!res.solved) return false;
    for (const m of res.solution) cur = multiply(cur, MOVES[m]!.cube);
    return true;
  };

  const ok1 = runPhase(hEO, ALL, eoSolved, 8, "P1 orient edges");
  const ok2 = ok1 && runPhase(g1, THIST_G1_MOVES, isG1, 12, "P2 domino reduction");
  const ok3 = ok2 && runPhase(g2, G1_MOVES, isSolved, 18, "P3 solve domino");

  const solution = phases.flatMap((p) => p.solution);
  const nodes = phases.reduce((a, p) => a + p.nodes, 0);
  const solved = ok3 && isSolved(cur);

  const stageDefs = [
    {
      label: "Phase 1 — orient all edges",
      explanation:
        "Make every edge oriented (no edge needs an F or B quarter turn to solve). The cube now lies in G1 = <U,D,L,R,F2,B2>.",
    },
    {
      label: "Phase 2 — domino reduction",
      explanation:
        "Orient all corners and send the four middle-slice edges into the middle slice. The cube reaches the 'domino' subgroup G2 = <U,D,L2,R2,F2,B2>.",
    },
    {
      label: "Phase 3 — solve the domino",
      explanation:
        "Finish using only U, D and half turns, which keep the cube inside G2 the whole way home.",
    },
  ];
  const stages: SolveStage[] = stageDefs.map((d, i) => ({ ...d, moves: phases[i]?.solution ?? [] }));

  return {
    solved,
    solution: solved ? solution : [],
    stats: {
      nodesExpanded: nodes,
      timeMs: Date.now() - start,
      peakMemoryBytes: 2048 + 1082565 + 40320 * 24, // table footprint estimate
      solutionLength: solved ? solution.length : 0,
    },
    stages,
    ...(solved ? {} : { timedOut: true }),
    meta: {
      phaseLengths: phases.map((p) => p.solution.length),
    },
  };
}

export const thistlethwaiteSolver: Solver = {
  id: "thistlethwaite",
  name: "Thistlethwaite",
  description:
    "Nested-group descent: orient edges, reduce to the 'domino' subgroup, then finish with only U, D and half turns. The first group-theoretic cube method (1981).",
  supports: () => true,
  solve: solveThistlethwaite,
};
