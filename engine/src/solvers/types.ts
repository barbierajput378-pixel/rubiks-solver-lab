/** Common solver interface. Every solver reports the same stats and is cancellable. */

import type { CubieCube } from "../model/types.js";

export interface SolveStats {
  nodesExpanded: number;
  timeMs: number;
  /** Best-effort peak memory attributable to the solve (bytes). May be approximate. */
  peakMemoryBytes: number;
  solutionLength: number;
}

/** A labeled stage of a solution (used by beginner/Thistlethwaite/Kociemba + Explainable UI). */
export interface SolveStage {
  label: string;
  /** Plain-English reason this stage exists / what it achieves. */
  explanation: string;
  /** Move indices (into MOVES) for this stage. */
  moves: number[];
}

export interface SolverProgress {
  nodesExpanded: number;
  /** IDA* iterative-deepening threshold, when applicable. */
  threshold?: number;
  /** Current search depth g(n). */
  g?: number;
  /** Heuristic estimate h(n) at the current node. */
  h?: number;
  /** Named phase, for multi-phase solvers. */
  phase?: string;
  /** Pruned vs expanded counters for the Search Explorer. */
  pruned?: number;
}

/** A cooperative cancellation token (works across Worker boundaries via a shared flag). */
export interface CancelToken {
  cancelled: boolean;
}

export interface SolveOptions {
  /** Hard wall-clock cap; the solver stops and returns `timedOut: true`. */
  timeoutMs?: number;
  cancel?: CancelToken;
  /** Cap on solution/search depth (used for honest benchmarks of optimal search). */
  maxDepth?: number;
  /** Progress callback; solvers throttle how often they call this. */
  onProgress?: (p: SolverProgress) => void;
  /** How many nodes between progress emits / cancel checks. */
  progressInterval?: number;
}

export interface SolveResult {
  solved: boolean;
  /** Move indices into MOVES; empty if already solved or failed. */
  solution: number[];
  stats: SolveStats;
  stages?: SolveStage[];
  timedOut?: boolean;
  cancelled?: boolean;
  /** Solver-specific extras (e.g. per-phase lengths, heuristic name). */
  meta?: Record<string, unknown>;
}

export interface Solver {
  id: string;
  name: string;
  description: string;
  /** Whether this solver can handle the given cube (e.g. 2x2-only solvers). */
  supports(cube: CubieCube): boolean;
  solve(cube: CubieCube, opts?: SolveOptions): SolveResult;
}

/** Shared helper: should we stop now? Returns 'timeout' | 'cancel' | null. */
export function checkStop(
  start: number,
  opts: SolveOptions | undefined,
): "timeout" | "cancel" | null {
  if (opts?.cancel?.cancelled) return "cancel";
  if (opts?.timeoutMs != null && Date.now() - start >= opts.timeoutMs) return "timeout";
  return null;
}
