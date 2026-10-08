/** Solvers public surface + registry. */

export * from "./types.js";
export * from "./coords.js";
export * from "./pdb.js";
export * from "./movetables.js";
export * from "./idastar.js";

export { bidirectionalBFS2x2, bfs2x2, bidirectionalBFS2x2Solver, bfs2x2Solver } from "./twoByTwo.js";
export {
  solveKociemba,
  kociembaSolver,
  buildKociembaTables,
  kociembaHeuristics,
  isG1,
  G1_MOVES,
  type KociembaBuildProgress,
} from "./kociemba.js";
export { solveThistlethwaite, thistlethwaiteSolver } from "./thistlethwaite.js";
export { solveBeginner, beginnerSolver } from "./beginner.js";
export {
  solveOptimal,
  optimalSolver,
  buildOptimalTables,
  makeHeuristic,
  type HeuristicConfig,
  type PdbBuildProgress,
} from "./optimal.js";

import type { Solver } from "./types.js";
import { bidirectionalBFS2x2Solver, bfs2x2Solver } from "./twoByTwo.js";
import { kociembaSolver } from "./kociemba.js";
import { thistlethwaiteSolver } from "./thistlethwaite.js";
import { beginnerSolver } from "./beginner.js";
import { optimalSolver } from "./optimal.js";

/** All solvers, keyed by id. The web app and benchmark CLI iterate this. */
export const SOLVERS: Record<string, Solver> = {
  [bidirectionalBFS2x2Solver.id]: bidirectionalBFS2x2Solver,
  [bfs2x2Solver.id]: bfs2x2Solver,
  [kociembaSolver.id]: kociembaSolver,
  [thistlethwaiteSolver.id]: thistlethwaiteSolver,
  [beginnerSolver.id]: beginnerSolver,
  [optimalSolver.id]: optimalSolver,
};

export const SOLVER_LIST: Solver[] = Object.values(SOLVERS);
