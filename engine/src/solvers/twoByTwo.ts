/**
 * 2×2×2 solvers operating on the 8 corners only.
 *
 * The DBL corner (index 6) is treated as fixed, so only U, R, F turns are used — this removes
 * whole-cube rotation symmetry and leaves exactly 3,674,160 reachable states (7!·3⁶).
 *  - `bidirectionalBFS2x2`: meet-in-the-middle, optimal, no precomputed table.
 *  - `bfs2x2`: plain breadth-first from the scramble, optimal, for comparison.
 */

import type { CubieCube } from "../model/types.js";
import { MOVES, invertAlg } from "../model/moves.js";
import { permToRank, oriToRank } from "./coords.js";
import type { Solver, SolveOptions, SolveResult } from "./types.js";
import { checkStop } from "./types.js";

// Allowed moves: U,R,F and their 2/' variants = MOVES indices 0..8.
const TWO_MOVES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const CORNER_MOVE_CP: number[][] = TWO_MOVES.map((m) => MOVES[m]!.cube.cp);
const CORNER_MOVE_CO: number[][] = TWO_MOVES.map((m) => MOVES[m]!.cube.co);

type Corners = { cp: number[]; co: number[] };

function cornerKey(cp: number[], co: number[]): number {
  return permToRank(cp) * 2187 + oriToRank(co, 3);
}

function applyCornerMove(c: Corners, mi: number): Corners {
  const mcp = CORNER_MOVE_CP[mi]!;
  const mco = CORNER_MOVE_CO[mi]!;
  const cp = new Array(8);
  const co = new Array(8);
  for (let i = 0; i < 8; i++) {
    cp[i] = c.cp[mcp[i]!]!;
    co[i] = (c.co[mcp[i]!]! + mco[i]!) % 3;
  }
  return { cp, co };
}

function isSolvedCorners(c: Corners): boolean {
  for (let i = 0; i < 8; i++) if (c.cp[i] !== i || c.co[i] !== 0) return false;
  return true;
}

interface Back {
  pk: number; // parent key
  m: number; // move index (into TWO_MOVES positions == MOVES index since they align 0..8)
}

function reconstruct(visited: Map<number, Back>, meet: number, startKey: number): number[] {
  const moves: number[] = [];
  let k = meet;
  while (k !== startKey) {
    const b = visited.get(k)!;
    moves.push(b.m);
    k = b.pk;
  }
  moves.reverse();
  return moves;
}

export function bidirectionalBFS2x2(cube: CubieCube, opts?: SolveOptions): SolveResult {
  const start = Date.now();
  const s0: Corners = { cp: cube.cp.slice(), co: cube.co.slice() };
  let nodes = 0;

  if (isSolvedCorners(s0)) {
    return {
      solved: true,
      solution: [],
      stats: { nodesExpanded: 0, timeMs: 0, peakMemoryBytes: 0, solutionLength: 0 },
    };
  }

  const startKey = cornerKey(s0.cp, s0.co);
  const goal: Corners = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0] };
  const goalKey = cornerKey(goal.cp, goal.co);

  const fwd = new Map<number, Back>([[startKey, { pk: -1, m: -1 }]]);
  const bwd = new Map<number, Back>([[goalKey, { pk: -1, m: -1 }]]);
  let fFrontier: { key: number; c: Corners }[] = [{ key: startKey, c: s0 }];
  let bFrontier: { key: number; c: Corners }[] = [{ key: goalKey, c: goal }];

  const maxDepth = opts?.maxDepth ?? 14;
  const interval = opts?.progressInterval ?? 20000;
  let depth = 0;

  const finish = (meet: number): SolveResult => {
    const fwdMoves = reconstruct(fwd, meet, startKey);
    const bwdMoves = reconstruct(bwd, meet, goalKey);
    const solution = fwdMoves.concat(invertAlg(bwdMoves));
    return {
      solved: true,
      solution,
      stats: {
        nodesExpanded: nodes,
        timeMs: Date.now() - start,
        peakMemoryBytes: (fwd.size + bwd.size) * 40,
        solutionLength: solution.length,
      },
      meta: { fwdVisited: fwd.size, bwdVisited: bwd.size, meetDepth: depth },
    };
  };

  while (depth < maxDepth) {
    // expand the smaller frontier
    const expandFwd = fFrontier.length <= bFrontier.length;
    const frontier = expandFwd ? fFrontier : bFrontier;
    const self = expandFwd ? fwd : bwd;
    const other = expandFwd ? bwd : fwd;
    const next: { key: number; c: Corners }[] = [];

    for (const node of frontier) {
      const stop = checkStop(start, opts);
      if (stop) {
        return {
          solved: false,
          solution: [],
          stats: {
            nodesExpanded: nodes,
            timeMs: Date.now() - start,
            peakMemoryBytes: (fwd.size + bwd.size) * 40,
            solutionLength: 0,
          },
          ...(stop === "timeout" ? { timedOut: true } : { cancelled: true }),
        };
      }
      for (let mi = 0; mi < TWO_MOVES.length; mi++) {
        const nc = applyCornerMove(node.c, mi);
        const nk = cornerKey(nc.cp, nc.co);
        if (self.has(nk)) continue;
        nodes++;
        self.set(nk, { pk: node.key, m: TWO_MOVES[mi]! });
        if (other.has(nk)) {
          depth++;
          return finish(nk);
        }
        next.push({ key: nk, c: nc });
        if (nodes % interval === 0) {
          opts?.onProgress?.({ nodesExpanded: nodes, g: depth + 1 });
        }
      }
    }

    if (expandFwd) fFrontier = next;
    else bFrontier = next;
    depth++;
    if (next.length === 0) break;
  }

  return {
    solved: false,
    solution: [],
    stats: {
      nodesExpanded: nodes,
      timeMs: Date.now() - start,
      peakMemoryBytes: (fwd.size + bwd.size) * 40,
      solutionLength: 0,
    },
    timedOut: opts?.timeoutMs != null,
  };
}

export function bfs2x2(cube: CubieCube, opts?: SolveOptions): SolveResult {
  const start = Date.now();
  const s0: Corners = { cp: cube.cp.slice(), co: cube.co.slice() };
  let nodes = 0;
  const startKey = cornerKey(s0.cp, s0.co);
  if (isSolvedCorners(s0)) {
    return { solved: true, solution: [], stats: { nodesExpanded: 0, timeMs: 0, peakMemoryBytes: 0, solutionLength: 0 } };
  }
  const visited = new Map<number, Back>([[startKey, { pk: -1, m: -1 }]]);
  let frontier: { key: number; c: Corners }[] = [{ key: startKey, c: s0 }];
  const maxDepth = opts?.maxDepth ?? 14;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: { key: number; c: Corners }[] = [];
    for (const node of frontier) {
      if (checkStop(start, opts)) {
        return { solved: false, solution: [], stats: { nodesExpanded: nodes, timeMs: Date.now() - start, peakMemoryBytes: visited.size * 40, solutionLength: 0 }, timedOut: true };
      }
      for (let mi = 0; mi < TWO_MOVES.length; mi++) {
        const nc = applyCornerMove(node.c, mi);
        const nk = cornerKey(nc.cp, nc.co);
        if (visited.has(nk)) continue;
        nodes++;
        visited.set(nk, { pk: node.key, m: TWO_MOVES[mi]! });
        if (isSolvedCorners(nc)) {
          const solution = reconstruct(visited, nk, startKey);
          return { solved: true, solution, stats: { nodesExpanded: nodes, timeMs: Date.now() - start, peakMemoryBytes: visited.size * 40, solutionLength: solution.length } };
        }
        next.push({ key: nk, c: nc });
      }
    }
    frontier = next;
    if (next.length === 0) break;
  }
  return { solved: false, solution: [], stats: { nodesExpanded: nodes, timeMs: Date.now() - start, peakMemoryBytes: visited.size * 40, solutionLength: 0 } };
}

export const bidirectionalBFS2x2Solver: Solver = {
  id: "bibfs-2x2",
  name: "Bidirectional BFS (2×2)",
  description:
    "Meet-in-the-middle breadth-first search on the 8 corners. Optimal; searches from the scramble and the solved state simultaneously so each only reaches ~half the depth.",
  supports: () => true,
  solve: bidirectionalBFS2x2,
};

export const bfs2x2Solver: Solver = {
  id: "bfs-2x2",
  name: "BFS (2×2)",
  description: "Plain breadth-first search on the 8 corners. Optimal, but expands far more nodes than the bidirectional version — included for comparison.",
  supports: () => true,
  solve: bfs2x2,
};
