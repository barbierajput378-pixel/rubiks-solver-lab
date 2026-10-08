import { describe, it, expect } from "vitest";
import { solvedCube, multiply, isSolved } from "../model/cubie.js";
import { MOVES, applyMoveIndex } from "../model/moves.js";
import { makeRng } from "../model/random.js";
import {
  CornerCoord,
  CornerOrientationCoord,
  EdgeOrientationCoord,
  makeEdgeSubsetCoord,
  buildPdb,
  maxHeuristic,
  EDGE_GROUP_A,
  EDGE_GROUP_B,
} from "./pdb.js";
import { idaStar } from "./idastar.js";
import type { CubieCube } from "../model/types.js";

function sig(c: CubieCube): string {
  return `${c.cp.join("")}|${c.co.join("")}|${c.ep.join(",")}|${c.eo.join("")}`;
}

/** BFS from solved to maxDepth; returns map signature -> true optimal distance. */
function bfsTrueDistances(maxDepth: number): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(sig(solvedCube()), 0);
  let frontier: { c: CubieCube; pf: number; p2: number }[] = [{ c: solvedCube(), pf: -1, p2: -1 }];
  const axisOf = [0, 1, 2, 0, 1, 2];
  for (let d = 0; d < maxDepth; d++) {
    const next: { c: CubieCube; pf: number; p2: number }[] = [];
    for (const node of frontier) {
      for (let m = 0; m < 18; m++) {
        const face = MOVES[m]!.face;
        if (face === node.pf) continue;
        if (axisOf[face] === axisOf[node.pf] && face < node.pf) continue;
        if (node.p2 >= 0 && face === node.p2 && axisOf[node.pf] === axisOf[face]) continue;
        const child = multiply(node.c, MOVES[m]!.cube);
        const s = sig(child);
        if (!dist.has(s)) {
          dist.set(s, d + 1);
          next.push({ c: child, pf: face, p2: node.pf });
        }
      }
    }
    frontier = next;
  }
  return dist;
}

describe("coordinate bijectivity", () => {
  it("CornerCoord round-trips for sampled indices and random cubes", () => {
    const rng = makeRng(1);
    for (let t = 0; t < 2000; t++) {
      const idx = Math.floor(rng() * CornerCoord.size);
      expect(CornerCoord.encode(CornerCoord.decode(idx))).toBe(idx);
    }
  });

  it("EdgeSubsetCoord round-trips for both Korf groups", () => {
    for (const subset of [EDGE_GROUP_A, EDGE_GROUP_B]) {
      const coord = makeEdgeSubsetCoord(subset);
      const rng = makeRng(7);
      for (let t = 0; t < 2000; t++) {
        const idx = Math.floor(rng() * coord.size);
        expect(coord.encode(coord.decode(idx))).toBe(idx);
      }
    }
  });
});

describe("pattern database generation", () => {
  it("builds the corner-orientation PDB fully with solved=0", () => {
    const pdb = buildPdb(CornerOrientationCoord);
    expect(pdb.table[CornerOrientationCoord.encode(solvedCube())]).toBe(0);
    // every state reachable, none left at 0xff
    let unfilled = 0;
    for (let i = 0; i < pdb.size; i++) if (pdb.table[i] === 0xff) unfilled++;
    expect(unfilled).toBe(0);
  });

  it("builds the edge-orientation PDB fully", () => {
    const pdb = buildPdb(EdgeOrientationCoord);
    let unfilled = 0;
    for (let i = 0; i < pdb.size; i++) if (pdb.table[i] === 0xff) unfilled++;
    expect(unfilled).toBe(0);
    expect(pdb.lookup(solvedCube())).toBe(0);
  });
});

describe("heuristic admissibility (vs BFS true distances, small depths)", () => {
  it("corner-orientation and edge-orientation PDBs never overestimate", () => {
    const coPdb = buildPdb(CornerOrientationCoord);
    const eoPdb = buildPdb(EdgeOrientationCoord);
    const h = maxHeuristic([coPdb, eoPdb]);
    // BFS depth 5, checking h(state) <= true distance at every state (one assertion at the end).
    const seen = new Set<string>([sig(solvedCube())]);
    let frontier: { c: CubieCube; pf: number; p2: number }[] = [{ c: solvedCube(), pf: -1, p2: -1 }];
    const axisOf = [0, 1, 2, 0, 1, 2];
    let checked = 0;
    let violations = 0;
    let worst = { h: 0, d: 0 };
    for (let d = 0; d < 5; d++) {
      const next: { c: CubieCube; pf: number; p2: number }[] = [];
      for (const node of frontier) {
        for (let m = 0; m < 18; m++) {
          const face = MOVES[m]!.face;
          if (face === node.pf) continue;
          if (axisOf[face] === axisOf[node.pf] && face < node.pf) continue;
          if (node.p2 >= 0 && face === node.p2 && axisOf[node.pf] === axisOf[face]) continue;
          const child = multiply(node.c, MOVES[m]!.cube);
          const s = sig(child);
          if (!seen.has(s)) {
            seen.add(s);
            checked++;
            const hv = h(child);
            if (hv > d + 1) {
              violations++;
              worst = { h: hv, d: d + 1 };
            }
            next.push({ c: child, pf: face, p2: node.pf });
          }
        }
      }
      frontier = next;
    }
    expect(checked).toBeGreaterThan(10000);
    expect({ violations, worst }).toEqual({ violations: 0, worst: { h: 0, d: 0 } });
  });
});

describe("IDA* optimality on shallow scrambles", () => {
  const coPdb = buildPdb(CornerOrientationCoord);
  const eoPdb = buildPdb(EdgeOrientationCoord);
  const h = maxHeuristic([coPdb, eoPdb]);
  const dist = bfsTrueDistances(5);

  function scramble(len: number, seed: number): { cube: CubieCube; moves: number[] } {
    const rng = makeRng(seed);
    const moves: number[] = [];
    let prev = -1;
    while (moves.length < len) {
      const m = Math.floor(rng() * 18);
      if (MOVES[m]!.face === prev) continue;
      moves.push(m);
      prev = MOVES[m]!.face;
    }
    let c = solvedCube();
    for (const m of moves) c = applyMoveIndex(c, m);
    return { cube: c, moves };
  }

  it("finds optimal-length solutions matching BFS true distance", () => {
    for (let s = 0; s < 20; s++) {
      const { cube } = scramble(3 + (s % 3), 500 + s);
      const trueDist = dist.get(sig(cube));
      const res = idaStar(cube, h, { timeoutMs: 15000, maxDepth: 12 });
      expect(res.solved).toBe(true);
      // the solution really solves it
      let c = cube;
      for (const m of res.solution) c = applyMoveIndex(c, m);
      expect(isSolved(c)).toBe(true);
      // and it is optimal
      if (trueDist !== undefined) expect(res.solution.length).toBe(trueDist);
    }
  });

  it("respects maxDepth and reports unsolved when capped too low", () => {
    const { cube } = scramble(8, 999);
    const res = idaStar(cube, h, { maxDepth: 1, timeoutMs: 5000 });
    expect(res.solved).toBe(false);
  });
});
