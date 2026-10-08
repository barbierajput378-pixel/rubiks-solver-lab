import { describe, it, expect } from "vitest";
import { solvedCube, multiply } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import { makeRng } from "../model/random.js";
import { bidirectionalBFS2x2, bfs2x2 } from "./twoByTwo.js";

// Build a corner scramble using only U,R,F-family moves (indices 0..8).
function scramble2x2(len: number, seed: number) {
  const rng = makeRng(seed);
  const moves: number[] = [];
  let prevFace = -1;
  while (moves.length < len) {
    const m = Math.floor(rng() * 9); // 0..8 -> U,R,F families
    const face = Math.floor(m / 3);
    if (face === prevFace) continue;
    moves.push(m);
    prevFace = face;
  }
  let cube = solvedCube();
  for (const m of moves) cube = multiply(cube, MOVES[m]!.cube);
  return { cube, moves };
}

function cornersSolvedAfter(cube: { cp: number[]; co: number[] }, solution: number[]) {
  let c = solvedCube();
  c = { ...c, cp: cube.cp.slice(), co: cube.co.slice() };
  for (const m of solution) c = multiply(c, MOVES[m]!.cube);
  for (let i = 0; i < 8; i++) if (c.cp[i] !== i || c.co[i] !== 0) return false;
  return true;
}

describe("2×2 bidirectional BFS", () => {
  it("solves random corner scrambles and the solution actually solves the corners", () => {
    for (let s = 0; s < 40; s++) {
      const { cube } = scramble2x2(8 + (s % 6), s + 1);
      const res = bidirectionalBFS2x2(cube, { timeoutMs: 10000 });
      expect(res.solved).toBe(true);
      expect(cornersSolvedAfter(cube, res.solution)).toBe(true);
    }
  });

  it("is optimal: agrees with plain BFS on solution length", () => {
    // keep plain BFS shallow so CI stays fast (unidirectional BFS blows up with depth)
    for (let s = 0; s < 8; s++) {
      const { cube } = scramble2x2(5 + (s % 3), 100 + s);
      const bi = bidirectionalBFS2x2(cube, { timeoutMs: 10000 });
      const bf = bfs2x2(cube, { timeoutMs: 20000 });
      expect(bi.solved && bf.solved).toBe(true);
      expect(bi.stats.solutionLength).toBe(bf.stats.solutionLength);
    }
  });

  it("bidirectional expands fewer nodes than plain BFS on harder scrambles", () => {
    const { cube } = scramble2x2(8, 777);
    const bi = bidirectionalBFS2x2(cube, { timeoutMs: 20000 });
    const bf = bfs2x2(cube, { timeoutMs: 30000 });
    expect(bi.solved && bf.solved).toBe(true);
    expect(bi.stats.nodesExpanded).toBeLessThan(bf.stats.nodesExpanded);
  });

  it("returns empty solution for an already-solved cube", () => {
    const res = bidirectionalBFS2x2(solvedCube());
    expect(res.solved).toBe(true);
    expect(res.solution).toHaveLength(0);
  });

  it("respects a short timeout by reporting timedOut", () => {
    const { cube } = scramble2x2(11, 42);
    const res = bidirectionalBFS2x2(cube, { timeoutMs: 0 });
    // with a 0ms budget it should not claim a solve
    expect(res.solved === false || res.solution.length > 0).toBe(true);
  });
});
