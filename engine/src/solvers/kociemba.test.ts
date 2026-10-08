import { describe, it, expect, beforeAll } from "vitest";
import { multiply, isSolved } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import { randomScramble, uniformRandomState } from "../model/random.js";
import { buildKociembaTables, solveKociemba, isG1 } from "./kociemba.js";
import type { CubieCube } from "../model/types.js";

function applySolution(cube: CubieCube, sol: number[]): CubieCube {
  let c = cube;
  for (const m of sol) c = multiply(c, MOVES[m]!.cube);
  return c;
}

describe("Kociemba two-phase solver", () => {
  beforeAll(() => buildKociembaTables());

  it("solves random-move scrambles; solution verified against the model", () => {
    for (let s = 0; s < 20; s++) {
      const { cube } = randomScramble(25, s + 1);
      const res = solveKociemba(cube, { timeoutMs: 10000 });
      expect(res.solved).toBe(true);
      expect(isSolved(applySolution(cube, res.solution))).toBe(true);
    }
  });

  it("solves uniform-random valid states (the hard distribution)", () => {
    for (let s = 0; s < 12; s++) {
      const cube = uniformRandomState(s * 31 + 7);
      const res = solveKociemba(cube, { timeoutMs: 10000 });
      expect(res.solved).toBe(true);
      expect(isSolved(applySolution(cube, res.solution))).toBe(true);
    }
  });

  it("produces short solutions (<= 30 moves) and reports two named phases", () => {
    for (let s = 0; s < 8; s++) {
      const { cube } = randomScramble(30, 200 + s);
      const res = solveKociemba(cube, { timeoutMs: 10000 });
      expect(res.solution.length).toBeLessThanOrEqual(30);
      expect(res.stages).toHaveLength(2);
      // after phase 1's moves, the cube must be in G1
      const afterP1 = applySolution(cube, res.stages![0]!.moves);
      expect(isG1(afterP1)).toBe(true);
    }
  });

  it("returns solved=true and empty solution for the solved cube", () => {
    const { cube } = randomScramble(0, 1); // zero-move scramble == solved
    const res = solveKociemba(cube, {});
    expect(res.solved).toBe(true);
    expect(res.solution.length).toBe(0);
  });
});
