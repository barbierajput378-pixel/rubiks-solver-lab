/**
 * Kociemba-style two-phase solver (own implementation, no external solver library).
 *
 * Phase 1 drives the cube into the subgroup G1 = <U,D,L2,R2,F2,B2> by making every corner and
 * edge oriented and sending the four E-slice edges into the E-slice. Phase 2 finishes inside
 * G1 using only its 10 moves. Each phase is an IDA* search guided by exact projection
 * distance tables (pattern databases over the phase coordinates). See docs/RESEARCH.md.
 */

import type { CubieCube } from "../model/types.js";
import { solvedCube, multiply } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import {
  permToRank,
  rankToPerm,
  oriToRank,
  rankToOri,
  combinationRank,
  combinationUnrank,
} from "./coords.js";
import { type Coordinate } from "./pdb.js";
import {
  buildCoMove,
  buildEoMove,
  buildSliceCombMove,
  buildCpMove,
  buildUdEdgeMove,
  buildSlicePermMove,
  productBfs,
  ALL_MOVES,
} from "./movetables.js";
import { idaStar } from "./idastar.js";
import type { Solver, SolveOptions, SolveResult, SolveStage } from "./types.js";

// G1 move set: U, D (all turns) + R2, L2, F2, B2.
const G1_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

const isSliceEdge = (id: number) => id >= 8;

// ---- Phase 1 coordinates (all 18 moves) ------------------------------------

/** Which 4 of the 12 edge slots hold the E-slice edges → combination rank in [0,495). */
function sliceCombRank(cube: CubieCube): number {
  const slots: number[] = [];
  for (let s = 0; s < 12; s++) if (isSliceEdge(cube.ep[s]!)) slots.push(s);
  return combinationRank(slots, 12);
}
function placeSliceByComb(rank: number): number[] {
  // returns ep with slice edges (8..11) in the chosen slots, U/D edges filling the rest
  const slots = combinationUnrank(rank, 12, 4);
  const ep = new Array(12).fill(-1);
  let sliceId = 8;
  for (const s of slots) ep[s] = sliceId++;
  let udId = 0;
  for (let s = 0; s < 12; s++) if (ep[s] < 0) ep[s] = udId++;
  return ep;
}

const CoSliceCoord: Coordinate = {
  name: "co-slice",
  size: 2187 * 495,
  encode: (cube) => oriToRank(cube.co, 3) * 495 + sliceCombRank(cube),
  decode: (index) => {
    const c = solvedCube();
    c.co = rankToOri(Math.floor(index / 495), 8, 3);
    c.ep = placeSliceByComb(index % 495);
    return c;
  },
};

const EoSliceCoord: Coordinate = {
  name: "eo-slice",
  size: 2048 * 495,
  encode: (cube) => {
    let eo = 0;
    for (let i = 0; i < 11; i++) eo = eo * 2 + cube.eo[i]!;
    return eo * 495 + sliceCombRank(cube);
  },
  decode: (index) => {
    const c = solvedCube();
    const eoRank = Math.floor(index / 495);
    const eo = new Array(12).fill(0);
    let r = eoRank;
    let sum = 0;
    for (let i = 10; i >= 0; i--) {
      eo[i] = r & 1;
      r >>= 1;
      sum += eo[i];
    }
    eo[11] = sum & 1;
    c.eo = eo;
    c.ep = placeSliceByComb(index % 495);
    return c;
  },
};

function isG1(cube: CubieCube): boolean {
  for (let i = 0; i < 8; i++) if (cube.co[i] !== 0) return false;
  for (let i = 0; i < 12; i++) if (cube.eo[i] !== 0) return false;
  for (let s = 0; s < 8; s++) if (isSliceEdge(cube.ep[s]!)) return false; // U/D slots hold no slice edges
  return true;
}

// ---- Phase 2 coordinates (G1 moves only) -----------------------------------

/** Permutation rank of the 4 slice edges among the 4 slice slots (8..11). */
function slicePermRank(cube: CubieCube): number {
  const p = [cube.ep[8]! - 8, cube.ep[9]! - 8, cube.ep[10]! - 8, cube.ep[11]! - 8];
  return permToRank(p);
}
function slicePermDecode(rank: number): number[] {
  return rankToPerm(rank, 4).map((x) => x + 8);
}

const CpermSliceCoord: Coordinate = {
  name: "cperm-slice",
  size: 40320 * 24,
  encode: (cube) => permToRank(cube.cp) * 24 + slicePermRank(cube),
  decode: (index) => {
    const c = solvedCube();
    c.cp = rankToPerm(Math.floor(index / 24), 8);
    const slice = slicePermDecode(index % 24);
    c.ep = [0, 1, 2, 3, 4, 5, 6, 7, slice[0]!, slice[1]!, slice[2]!, slice[3]!];
    return c;
  },
};

const UdEdgePermSliceCoord: Coordinate = {
  name: "udedge-slice",
  size: 40320 * 24,
  encode: (cube) => {
    const ud = [cube.ep[0]!, cube.ep[1]!, cube.ep[2]!, cube.ep[3]!, cube.ep[4]!, cube.ep[5]!, cube.ep[6]!, cube.ep[7]!];
    return permToRank(ud) * 24 + slicePermRank(cube);
  },
  decode: (index) => {
    const c = solvedCube();
    const ud = rankToPerm(Math.floor(index / 24), 8);
    const slice = slicePermDecode(index % 24);
    c.ep = [...ud, slice[0]!, slice[1]!, slice[2]!, slice[3]!];
    return c;
  },
};

// ---- Lazily-built, memoized tables -----------------------------------------

let phase1: { h: (c: CubieCube) => number } | null = null;
let phase2: { h: (c: CubieCube) => number } | null = null;

export interface KociembaBuildProgress {
  phase: 1 | 2;
  table: string;
}

export function buildKociembaTables(onProgress?: (p: KociembaBuildProgress) => void): void {
  if (!phase1) {
    onProgress?.({ phase: 1, table: "co-slice" });
    const coMove = buildCoMove(ALL_MOVES);
    const eoMove = buildEoMove(ALL_MOVES);
    const sliceMove = buildSliceCombMove(ALL_MOVES);
    // Solved slice configuration (edges in slots 8..11) is not combination-rank 0.
    const solvedSlice = combinationRank([8, 9, 10, 11], 12);
    const pr1a = productBfs(2187, coMove, 495, sliceMove, 18, 0 * 495 + solvedSlice); // co*495 + slice
    onProgress?.({ phase: 1, table: "eo-slice" });
    const pr1b = productBfs(2048, eoMove, 495, sliceMove, 18, 0 * 495 + solvedSlice); // eo*495 + slice
    phase1 = {
      h: (c) => {
        const slice = sliceCombRank(c);
        const a = pr1a[oriToRank(c.co, 3) * 495 + slice]!;
        let eo = 0;
        for (let i = 0; i < 11; i++) eo = eo * 2 + c.eo[i]!;
        const b = pr1b[eo * 495 + slice]!;
        return a > b ? a : b;
      },
    };
  }
  if (!phase2) {
    onProgress?.({ phase: 2, table: "cperm-slice" });
    const cpMove = buildCpMove(G1_MOVES);
    const slicePermMove = buildSlicePermMove(G1_MOVES);
    const pr2a = productBfs(40320, cpMove, 24, slicePermMove, G1_MOVES.length); // cp*24 + sp
    onProgress?.({ phase: 2, table: "udedge-slice" });
    const udMove = buildUdEdgeMove(G1_MOVES);
    const pr2b = productBfs(40320, udMove, 24, slicePermMove, G1_MOVES.length); // ud*24 + sp
    phase2 = {
      h: (c) => {
        const sp = slicePermRank(c);
        const a = pr2a[permToRank(c.cp) * 24 + sp]!;
        const ud = permToRank([c.ep[0]!, c.ep[1]!, c.ep[2]!, c.ep[3]!, c.ep[4]!, c.ep[5]!, c.ep[6]!, c.ep[7]!]);
        const b = pr2b[ud * 24 + sp]!;
        return a > b ? a : b;
      },
    };
  }
}

/** Reset memoized tables (used by tests/benchmarks to measure build time). */
export function _resetKociembaTables(): void {
  phase1 = null;
  phase2 = null;
}

/** Phase heuristics (building the tables if needed). Reused by the Thistlethwaite solver. */
export function kociembaHeuristics(): {
  g1: (c: CubieCube) => number;
  g2: (c: CubieCube) => number;
} {
  buildKociembaTables();
  return { g1: phase1!.h, g2: phase2!.h };
}

export function solveKociemba(cube: CubieCube, opts?: SolveOptions): SolveResult {
  const start = Date.now();
  buildKociembaTables();
  const budget = opts?.timeoutMs ?? 10000;

  // Phase 1: reach G1.
  const p1 = idaStar(
    cube,
    phase1!.h,
    { ...opts, timeoutMs: budget, maxDepth: 12 },
    { name: "Phase 1 — orient & slice", heuristicName: "max(co-slice, eo-slice)" },
    { moves: Array.from({ length: 18 }, (_, i) => i), isGoal: isG1 },
  );
  if (!p1.solved) {
    return {
      solved: false,
      solution: [],
      stats: { nodesExpanded: p1.stats.nodesExpanded, timeMs: Date.now() - start, peakMemoryBytes: p1.stats.peakMemoryBytes, solutionLength: 0 },
      ...(p1.timedOut ? { timedOut: true } : {}),
      ...(p1.cancelled ? { cancelled: true } : {}),
    };
  }

  // Apply phase-1 solution to get the G1 state.
  let mid = cube;
  for (const m of p1.solution) mid = multiply(mid, MOVES[m]!.cube);

  const remaining = budget - (Date.now() - start);
  const p2 = idaStar(
    mid,
    phase2!.h,
    { ...opts, timeoutMs: Math.max(1, remaining), maxDepth: 18 },
    { name: "Phase 2 — permute within G1", heuristicName: "max(cperm-slice, udedge-slice)" },
    { moves: G1_MOVES },
  );

  const solution = p1.solution.concat(p2.solution);
  const stages: SolveStage[] = [
    {
      label: "Phase 1 — orient edges & corners, place slice",
      explanation:
        "Make every corner and edge oriented and move the four middle-slice edges into the middle slice. After this, the cube lies in the subgroup G1 and can be finished with only U, D and half turns.",
      moves: p1.solution,
    },
    {
      label: "Phase 2 — solve within G1",
      explanation:
        "With orientation fixed, permute the pieces home using only <U, D, L2, R2, F2, B2>, which never disturbs the orientation achieved in phase 1.",
      moves: p2.solution,
    },
  ];

  return {
    solved: p2.solved,
    solution,
    stats: {
      nodesExpanded: p1.stats.nodesExpanded + p2.stats.nodesExpanded,
      timeMs: Date.now() - start,
      peakMemoryBytes: Math.max(p1.stats.peakMemoryBytes, p2.stats.peakMemoryBytes),
      solutionLength: solution.length,
    },
    stages,
    ...(p2.timedOut ? { timedOut: true } : {}),
    ...(p2.cancelled ? { cancelled: true } : {}),
    meta: { phase1Length: p1.solution.length, phase2Length: p2.solution.length },
  };
}

export const kociembaSolver: Solver = {
  id: "kociemba",
  name: "Kociemba two-phase",
  description:
    "Own implementation of Herbert Kociemba's two-phase method: reach the oriented subgroup G1, then finish inside it. Fast and near-optimal on any 3×3 state.",
  supports: () => true,
  solve: solveKociemba,
};

export { CoSliceCoord, EoSliceCoord, CpermSliceCoord, UdEdgePermSliceCoord, isG1, G1_MOVES };
