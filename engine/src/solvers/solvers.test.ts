import { describe, it, expect, beforeAll } from "vitest";
import { multiply, isSolved } from "../model/cubie.js";
import { MOVES, applyMoveIndex } from "../model/moves.js";
import { randomScramble, uniformRandomState } from "../model/random.js";
import type { CubieCube } from "../model/types.js";
import { buildKociembaTables } from "./kociemba.js";
import { solveThistlethwaite } from "./thistlethwaite.js";
import { solveBeginner } from "./beginner.js";
import { solveOptimal, buildOptimalTables } from "./optimal.js";
import { SOLVER_LIST, SOLVERS } from "./index.js";

function verify(cube: CubieCube, sol: number[]): boolean {
  let c = cube;
  for (const m of sol) c = multiply(c, MOVES[m]!.cube);
  return isSolved(c);
}

describe("Thistlethwaite solver", () => {
  beforeAll(() => buildKociembaTables());

  it("solves scrambles and uniform states with three named phases", () => {
    for (let s = 0; s < 12; s++) {
      const cube = s % 2 ? uniformRandomState(s * 11 + 1) : randomScramble(25, s + 1).cube;
      const res = solveThistlethwaite(cube, { timeoutMs: 15000 });
      expect(res.solved).toBe(true);
      expect(verify(cube, res.solution)).toBe(true);
      expect(res.stages).toHaveLength(3);
    }
  });
});

describe("Beginner layer-by-layer solver", () => {
  beforeAll(() => buildKociembaTables());

  it("solves cubes and reports human-recognizable stages", () => {
    for (let s = 0; s < 12; s++) {
      const cube = s % 2 ? uniformRandomState(s * 13 + 5) : randomScramble(25, s + 1).cube;
      const res = solveBeginner(cube, { timeoutMs: 15000 });
      expect(res.solved).toBe(true);
      expect(verify(cube, res.solution)).toBe(true);
      expect(res.stages!.length).toBeGreaterThanOrEqual(3);
      expect(res.stages![0]!.label).toMatch(/cross/i);
    }
  });
});

describe("solver registry", () => {
  it("exposes all solvers with unique ids and descriptions", () => {
    expect(SOLVER_LIST.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(SOLVER_LIST.map((s) => s.id));
    expect(ids.size).toBe(SOLVER_LIST.length);
    for (const s of SOLVER_LIST) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
    expect(SOLVERS["kociemba"]).toBeDefined();
  });
});

describe("Optimal IDA* + PDB solver", () => {
  beforeAll(() => buildOptimalTables());

  it("returns optimal (shortest) solutions on shallow scrambles", () => {
    // scramble with a small number of non-cancelling moves; optimal length <= scramble length
    for (let s = 0; s < 6; s++) {
      const len = 4 + (s % 3);
      let cube = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } as CubieCube;
      const sc = randomScramble(len, 900 + s);
      cube = sc.cube;
      const res = solveOptimal(cube, { timeoutMs: 20000, maxDepth: 12 });
      expect(res.solved).toBe(true);
      expect(verify(cube, res.solution)).toBe(true);
      expect(res.solution.length).toBeLessThanOrEqual(len);
    }
  });

  it("is cancellable via a cancel token", () => {
    const cube = uniformRandomState(42); // hard state
    const cancel = { cancelled: true };
    const res = solveOptimal(cube, { cancel, maxDepth: 20 });
    expect(res.solved).toBe(false);
  });
});
