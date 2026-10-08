/**
 * Runs a solve in a dedicated Web Worker so the UI stays at 60fps. Cancellation terminates the
 * worker (the solve is synchronous inside it). Each call spawns its own worker, which is what
 * lets Race Mode run several solvers truly in parallel.
 */

import type { CubieCube, SolveResult, SolverProgress } from "@cubelab/engine";
import type { SolveResponse } from "../worker/solver.worker.ts";

export interface SolveHandlers {
  onProgress?: (p: SolverProgress) => void;
  onBuilding?: (table: string) => void;
}

export interface RunningSolve {
  promise: Promise<SolveResult>;
  cancel: () => void;
}

let jobCounter = 0;

export function runSolve(
  solverId: string,
  cube: CubieCube,
  opts: { timeoutMs?: number; maxDepth?: number; progressInterval?: number; heuristic?: { corners?: boolean; edgeOrientation?: boolean } },
  handlers: SolveHandlers = {},
): RunningSolve {
  const worker = new Worker(new URL("../worker/solver.worker.ts", import.meta.url), { type: "module" });
  const jobId = ++jobCounter;
  let settled = false;

  const promise = new Promise<SolveResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<SolveResponse>) => {
      const msg = e.data;
      if (msg.jobId !== jobId) return;
      if (msg.type === "building") handlers.onBuilding?.(msg.table);
      else if (msg.type === "progress") handlers.onProgress?.(msg.progress);
      else if (msg.type === "result") {
        settled = true;
        resolve(msg.result);
        worker.terminate();
      } else if (msg.type === "error") {
        settled = true;
        reject(new Error(msg.message));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      if (!settled) {
        settled = true;
        reject(new Error(e.message));
        worker.terminate();
      }
    };
    worker.postMessage({ type: "solve", solverId, cube, opts, jobId });
  });

  return {
    promise,
    cancel: () => {
      if (!settled) {
        settled = true;
        worker.terminate();
      }
    },
  };
}
