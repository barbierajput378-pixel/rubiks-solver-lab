/// <reference lib="webworker" />
/**
 * Solver worker: runs one solve off the main thread so the UI never freezes, streaming live
 * progress (nodes expanded, threshold, h/g) back as it searches. Cancellation is done by the
 * main thread terminating the worker (the solve itself is synchronous inside the worker).
 *
 * Table building (Kociemba phase tables, optional corner PDB) happens lazily in the worker and
 * is reported with "building" messages so the UI can show a progress bar.
 */

import {
  SOLVERS,
  buildKociembaTables,
  buildOptimalTables,
  exportOptimalTables,
  importOptimalTables,
  type CubieCube,
  type SolveResult,
  type SolverProgress,
} from "@cubelab/engine";

export interface SolveRequest {
  type: "solve";
  solverId: string;
  cube: CubieCube;
  opts: { timeoutMs?: number; maxDepth?: number; progressInterval?: number; heuristic?: { corners?: boolean; edgeOrientation?: boolean } };
  jobId: number;
}

export type SolveResponse =
  | { type: "building"; table: string; jobId: number }
  | { type: "progress"; progress: SolverProgress; jobId: number }
  | { type: "result"; result: SolveResult; jobId: number }
  | { type: "error"; message: string; jobId: number };

const NEEDS_KOCIEMBA = new Set(["kociemba", "thistlethwaite", "beginner"]);

function readCachedOptimal(): Promise<{ corners: Uint8Array; edgeOrientation: Uint8Array } | undefined> {
  return new Promise((resolve) => {
    if (!indexedDB) return resolve(undefined);
    const open = indexedDB.open("cubelab-tables", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("pdb", { keyPath: "key" });
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      const req = open.result.transaction("pdb", "readonly").objectStore("pdb").get("optimal-v1");
      req.onsuccess = () => resolve(req.result?.tables);
      req.onerror = () => resolve(undefined);
    };
  });
}
function cacheOptimal(tables: { corners: Uint8Array; edgeOrientation: Uint8Array }): void {
  if (!indexedDB) return;
  const open = indexedDB.open("cubelab-tables", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("pdb", { keyPath: "key" });
  open.onsuccess = () => { const tx = open.result.transaction("pdb", "readwrite"); tx.objectStore("pdb").put({ key: "optimal-v1", tables }); };
}

self.onmessage = async (e: MessageEvent<SolveRequest>) => {
  const msg = e.data;
  if (msg.type !== "solve") return;
  const { solverId, cube, opts, jobId } = msg;
  const post = (m: SolveResponse) => (self as unknown as Worker).postMessage(m);

  try {
    const solver = SOLVERS[solverId];
    if (!solver) throw new Error(`unknown solver ${solverId}`);

    if (NEEDS_KOCIEMBA.has(solverId)) {
      post({ type: "building", table: "phase tables", jobId });
      buildKociembaTables();
    }
    if (solverId === "ida-pdb") {
      const cached = await readCachedOptimal();
      if (cached) importOptimalTables(cached);
      buildOptimalTables((p) => post({ type: "building", table: p.name, jobId }));
      const tables = exportOptimalTables();
      if (tables) cacheOptimal(tables);
    }

    const result = solver.solve(cube, {
      ...opts,
      progressInterval: opts.progressInterval ?? 50000,
      onProgress: (progress) => post({ type: "progress", progress, jobId }),
    });
    post({ type: "result", result, jobId });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err), jobId });
  }
};
