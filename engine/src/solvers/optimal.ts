/**
 * Optimal IDA* solver using Korf-style pattern databases.
 *
 * The default heuristic combines a full corner pattern database (8! · 3⁷ = 88,179,840 entries,
 * exact corner distance) with the edge-orientation database, taking their maximum. This is an
 * admissible lower bound, so IDA* returns a provably shortest solution — but as the spec notes,
 * optimal search on deep/random 3×3 states is exponential, so callers apply depth caps (see the
 * benchmark harness and README → Limitations). The heuristic set is pluggable so the Heuristic
 * Lab (Phase 5) can toggle databases and watch the effect on nodes expanded.
 */

import type { CubieCube } from "../model/types.js";
import { permToRank, oriToRank } from "./coords.js";
import {
  buildCpMove,
  buildCoMove,
  buildEoMove,
  productBfs,
  ALL_MOVES,
} from "./movetables.js";
import { idaStar } from "./idastar.js";
import type { Solver, SolveOptions, SolveResult } from "./types.js";

let cornerPdb: Uint8Array | null = null;
let eoPdb: Uint8Array | null = null;

export interface PdbBuildProgress {
  name: string;
  done: boolean;
}

/** Build (and memoize) the corner + edge-orientation pattern databases. */
export function buildOptimalTables(onProgress?: (p: PdbBuildProgress) => void): void {
  if (!cornerPdb) {
    onProgress?.({ name: "corners (88M)", done: false });
    const cp = buildCpMove(ALL_MOVES);
    const co = buildCoMove(ALL_MOVES);
    cornerPdb = productBfs(40320, cp, 2187, co, 18, 0); // index = cp*2187 + co
    onProgress?.({ name: "corners (88M)", done: true });
  }
  if (!eoPdb) {
    onProgress?.({ name: "edge-orientation", done: false });
    const eo = buildEoMove(ALL_MOVES);
    eoPdb = productBfs(2048, eo, 1, new Int32Array(18), 18, 0);
    onProgress?.({ name: "edge-orientation", done: true });
  }
}

export function _resetOptimalTables(): void {
  cornerPdb = null;
  eoPdb = null;
}

/** Heuristic toggles for the Heuristic Lab. */
export interface HeuristicConfig {
  corners?: boolean;
  edgeOrientation?: boolean;
}

export function makeHeuristic(config: HeuristicConfig = { corners: true, edgeOrientation: true }): (c: CubieCube) => number {
  buildOptimalTables();
  const cpdb = cornerPdb!;
  const epdb = eoPdb!;
  return (c: CubieCube) => {
    let h = 0;
    if (config.corners) {
      const v = cpdb[permToRank(c.cp) * 2187 + oriToRank(c.co, 3)]!;
      if (v > h) h = v;
    }
    if (config.edgeOrientation) {
      let eo = 0;
      for (let i = 0; i < 11; i++) eo = eo * 2 + c.eo[i]!;
      const v = epdb[eo]!;
      if (v > h) h = v;
    }
    return h;
  };
}

export function solveOptimal(cube: CubieCube, opts?: SolveOptions): SolveResult {
  const h = makeHeuristic({ corners: true, edgeOrientation: true });
  return idaStar(cube, h, opts, { name: "IDA* (corner PDB + EO)", heuristicName: "max(corners, edge-orientation)" });
}

export const optimalSolver: Solver = {
  id: "ida-pdb",
  name: "IDA* + pattern DB (optimal)",
  description:
    "Iterative-deepening A* with a corner pattern database and edge-orientation table (admissible max). Returns a provably optimal solution; practical only to moderate depths (use the depth cap for hard states).",
  supports: () => true,
  solve: solveOptimal,
};
