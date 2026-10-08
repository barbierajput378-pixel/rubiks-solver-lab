/**
 * IDA* (iterative-deepening A*) with an admissible pattern-database heuristic.
 *
 * Move pruning: never turn the same face twice in a row, and turn opposite faces only in a
 * canonical (increasing) order so U D and D U aren't both explored. The search streams its
 * threshold, node counts and h/g to `onProgress` so the Search Explorer can visualize it.
 */

import type { CubieCube } from "../model/types.js";
import { multiply, isSolved } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import type { Solver, SolveOptions, SolveResult } from "./types.js";

const FACE_OF_MOVE = MOVES.map((m) => m.face);
const AXIS_OF_FACE = [0, 1, 2, 0, 1, 2]; // U,R,F,D,L,B -> axis

/** Should a move be pruned given the previous two move faces? */
function pruned(face: number, prevFace: number, prev2Face: number): boolean {
  if (prevFace < 0) return false;
  if (face === prevFace) return true; // same face twice
  if (AXIS_OF_FACE[face] === AXIS_OF_FACE[prevFace]) {
    // opposite faces (same axis): require canonical increasing order
    if (face < prevFace) return true;
  }
  // A B A on the same axis where A,B opposite: covered by the above + three-in-a-row check
  if (
    prev2Face >= 0 &&
    face === prev2Face &&
    AXIS_OF_FACE[prevFace] === AXIS_OF_FACE[face]
  ) {
    return true;
  }
  return false;
}

export interface IdaMeta {
  name: string;
  heuristicName: string;
}

export interface IdaConfig {
  /** Allowed move indices (default: all 18). */
  moves?: number[];
  /** Goal predicate (default: fully solved). */
  isGoal?: (c: CubieCube) => boolean;
}

export function idaStar(
  cube: CubieCube,
  heuristic: (c: CubieCube) => number,
  opts?: SolveOptions,
  meta?: IdaMeta,
  config?: IdaConfig,
): SolveResult {
  const start = Date.now();
  const maxDepth = opts?.maxDepth ?? 20;
  const interval = opts?.progressInterval ?? 200000;
  const moveList = config?.moves ?? Array.from({ length: 18 }, (_, i) => i);
  const goalTest = config?.isGoal ?? isSolved;

  let nodes = 0;
  let pruneCount = 0;
  let stopReason: "timeout" | "cancel" | null = null;
  const path: number[] = [];

  const baseResult = (solved: boolean): SolveResult => ({
    solved,
    solution: solved ? path.slice() : [],
    stats: {
      nodesExpanded: nodes,
      timeMs: Date.now() - start,
      peakMemoryBytes: path.length * 8, // IDA* is linear-memory in the path depth
      solutionLength: solved ? path.length : 0,
    },
    ...(stopReason === "timeout" ? { timedOut: true } : {}),
    ...(stopReason === "cancel" ? { cancelled: true } : {}),
    ...(meta ? { meta: { ...meta, threshold: path.length } } : {}),
  });

  if (goalTest(cube)) return baseResult(true);

  let threshold = heuristic(cube);

  // Returns the next threshold (minimum f that exceeded), or -1 if a solution was found,
  // or -2 if stopped.
  function dfs(
    node: CubieCube,
    g: number,
    prevFace: number,
    prev2Face: number,
  ): number {
    const h = heuristic(node);
    const f = g + h;
    if (f > threshold) return f;
    if (goalTest(node)) return -1;

    nodes++;
    if (nodes % interval === 0) {
      opts?.onProgress?.({
        nodesExpanded: nodes,
        threshold,
        g,
        h,
        pruned: pruneCount,
        ...(meta ? { phase: meta.name } : {}),
      });
      if (opts?.cancel?.cancelled) {
        stopReason = "cancel";
        return -2;
      }
      if (opts?.timeoutMs != null && Date.now() - start >= opts.timeoutMs) {
        stopReason = "timeout";
        return -2;
      }
    }

    let min = Infinity;
    for (const m of moveList) {
      const face = FACE_OF_MOVE[m]!;
      if (pruned(face, prevFace, prev2Face)) {
        pruneCount++;
        continue;
      }
      const child = multiply(node, MOVES[m]!.cube);
      path.push(m);
      const t = dfs(child, g + 1, face, prevFace);
      if (t === -1) return -1; // found
      if (t === -2) return -2; // stopped
      if (t < min) min = t;
      path.pop();
    }
    return min;
  }

  while (threshold <= maxDepth) {
    if (opts?.cancel?.cancelled) {
      stopReason = "cancel";
      return baseResult(false);
    }
    if (opts?.timeoutMs != null && Date.now() - start >= opts.timeoutMs) {
      stopReason = "timeout";
      return baseResult(false);
    }
    opts?.onProgress?.({ nodesExpanded: nodes, threshold, pruned: pruneCount, ...(meta ? { phase: meta.name } : {}) });
    const t = dfs(cube, 0, -1, -1);
    if (t === -1) return baseResult(true);
    if (t === -2) return baseResult(false);
    if (t === Infinity) break; // exhausted
    threshold = t;
  }
  return baseResult(false);
}

/** Wrap a heuristic as a reusable Solver. */
export function makeIdaStarSolver(
  id: string,
  name: string,
  description: string,
  heuristic: (c: CubieCube) => number,
  heuristicName: string,
): Solver {
  return {
    id,
    name,
    description,
    supports: () => true,
    solve: (cube, opts) => idaStar(cube, heuristic, opts, { name, heuristicName }),
  };
}
