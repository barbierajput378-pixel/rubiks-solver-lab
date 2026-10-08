import { describe, it, expect } from "vitest";
import {
  solvedCube,
  isSolved,
  cubesEqual,
  multiply,
  invert,
  cloneCube,
  permParity,
} from "./cubie.js";
import {
  MOVES,
  MOVE_INDEX_BY_NAME,
  parseAlg,
  formatAlg,
  applyAlg,
  invertAlg,
  cubeFromAlg,
  inverseMoveIndex,
} from "./moves.js";
import {
  SOLVED_FACELETS,
  FACELET_MOVE,
  faceletToCubie,
  cubieToFacelet,
  applyFaceletMove,
} from "./geometry.js";
import { validateFacelets, validateCubie } from "./validity.js";
import { uniformRandomState, randomScramble, makeRng } from "./random.js";
import { Face } from "./types.js";

describe("facelet/cubie round-trip", () => {
  it("solved facelets decode to the solved cube and back", () => {
    const cube = faceletToCubie(SOLVED_FACELETS);
    expect(isSolved(cube)).toBe(true);
    expect(cubieToFacelet(cube)).toEqual(SOLVED_FACELETS);
  });

  it("round-trips for many random scrambles", () => {
    for (let s = 0; s < 200; s++) {
      const { cube } = randomScramble(25, 1000 + s);
      const fc = cubieToFacelet(cube);
      const back = faceletToCubie(fc);
      expect(cubesEqual(back, cube)).toBe(true);
    }
  });
});

describe("cubie moves faithfully mirror facelet geometry", () => {
  // The decisive correctness proof: applying any sequence via cubie multiply and reading
  // out facelets must equal applying the same sequence directly on the facelet model.
  it("agrees with facelet-level application over random sequences", () => {
    const rng = makeRng(42);
    for (let trial = 0; trial < 300; trial++) {
      const len = 1 + Math.floor(rng() * 20);
      const seq: number[] = [];
      for (let i = 0; i < len; i++) seq.push(Math.floor(rng() * 18));

      // cubie path
      const cube = cubeFromAlg(seq);
      const viaCubie = cubieToFacelet(cube);

      // facelet path: apply each move as `power` quarter turns of its face
      let fc = SOLVED_FACELETS.slice();
      for (const m of seq) {
        const def = MOVES[m]!;
        for (let p = 0; p < def.power; p++) fc = applyFaceletMove(fc, FACELET_MOVE[def.face]!);
      }
      expect(viaCubie).toEqual(fc);
    }
  });
});

describe("move algebra", () => {
  it("each quarter turn has order 4, half turn order 2", () => {
    for (const def of MOVES) {
      let c = solvedCube();
      const period = def.power === 2 ? 2 : 4;
      for (let i = 0; i < period; i++) c = multiply(c, def.cube);
      expect(isSolved(c)).toBe(true);
      // and it is NOT solved before completing the period (for quarter turns)
      if (period === 4) {
        let c2 = multiply(solvedCube(), def.cube);
        expect(isSolved(c2)).toBe(false);
        c2 = multiply(c2, def.cube);
        expect(isSolved(c2)).toBe(false);
      }
    }
  });

  it("move times its inverse equals identity", () => {
    for (let i = 0; i < MOVES.length; i++) {
      const c = multiply(MOVES[i]!.cube, MOVES[inverseMoveIndex(i)]!.cube);
      expect(isSolved(c)).toBe(true);
    }
  });

  it("(A B)^-1 = B^-1 A^-1", () => {
    const A = cubeFromAlg("R U F");
    const B = cubeFromAlg("L2 D B'");
    const AB = multiply(A, B);
    const lhs = invert(AB);
    const rhs = multiply(invert(B), invert(A));
    expect(cubesEqual(lhs, rhs)).toBe(true);
  });

  it("an algorithm followed by its inverse returns to solved", () => {
    const alg = parseAlg("R U R' U' F2 L D' B");
    const cube = applyAlg(solvedCube(), alg);
    const back = applyAlg(cube, invertAlg(alg));
    expect(isSolved(back)).toBe(true);
  });

  it("the sexy move (R U R' U') has order 6", () => {
    let c = solvedCube();
    for (let i = 0; i < 6; i++) c = applyAlg(c, "R U R' U'");
    expect(isSolved(c)).toBe(true);
    // not solved after fewer repetitions
    let c2 = solvedCube();
    for (let i = 0; i < 5; i++) {
      c2 = applyAlg(c2, "R U R' U'");
      expect(isSolved(c2)).toBe(false);
    }
  });

  it("the superflip is reached by a known 20-move algorithm and is self-inverse", () => {
    // Superflip: all edges flipped, everything else solved. A well-known optimal solution.
    const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
    const cube = cubeFromAlg(superflip);
    // every edge flipped, permutation identity, corners solved
    expect(cube.ep).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(cube.eo.every((x) => x === 1)).toBe(true);
    expect(cube.cp).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(cube.co.every((x) => x === 0)).toBe(true);
    // applying it twice returns to solved (superflip is an involution)
    expect(isSolved(cubeFromAlg(superflip + " " + superflip))).toBe(true);
  });

  it("parse/format round-trip", () => {
    const s = "R U2 R' D' F2 B L'";
    expect(formatAlg(parseAlg(s))).toBe(s);
    expect(() => parseAlg("R X2")).toThrow();
  });

  it("all 18 moves preserve validity (each is a solvable state)", () => {
    for (const def of MOVES) {
      const res = validateCubie(def.cube);
      expect(res.ok).toBe(true);
    }
  });
});

describe("validity checker", () => {
  it("accepts the solved cube and random scrambles", () => {
    expect(validateFacelets(SOLVED_FACELETS).ok).toBe(true);
    for (let s = 0; s < 50; s++) {
      const { cube } = randomScramble(30, s);
      expect(validateFacelets(cubieToFacelet(cube)).ok).toBe(true);
    }
  });

  it("detects a single twisted corner (twist sum != 0)", () => {
    const cube = solvedCube();
    cube.co[0] = 1; // twist one corner; sum becomes 1 mod 3
    const res = validateCubie(cube);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === "CORNER_TWIST")).toBe(true);
  });

  it("detects a single flipped edge (flip sum != 0)", () => {
    const cube = solvedCube();
    cube.eo[0] = 1;
    const res = validateCubie(cube);
    expect(res.reasons.some((r) => r.code === "EDGE_FLIP")).toBe(true);
  });

  it("detects a parity mismatch (two pieces swapped)", () => {
    const cube = solvedCube();
    [cube.cp[0], cube.cp[1]] = [cube.cp[1]!, cube.cp[0]!]; // swap two corners only
    const res = validateCubie(cube);
    expect(res.reasons.some((r) => r.code === "PERMUTATION_PARITY")).toBe(true);
  });

  it("detects bad color counts and non-pieces in painted input", () => {
    const fc = SOLVED_FACELETS.slice();
    fc[0] = Face.R; // now U has 8, R has 10, and corner slot 2 (ULB) gets a bad color-set
    const res = validateFacelets(fc);
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.code === "BAD_COLOR_COUNT")).toBe(true);
  });
});

describe("random state & scramble generators", () => {
  it("uniformRandomState is reproducible and always valid", () => {
    for (let s = 0; s < 100; s++) {
      const a = uniformRandomState(s);
      const b = uniformRandomState(s);
      expect(cubesEqual(a, b)).toBe(true); // reproducible
      expect(validateCubie(a).ok).toBe(true); // always solvable
    }
  });

  it("uniform states have matching permutation parity and correct orientation sums", () => {
    for (let s = 0; s < 100; s++) {
      const c = uniformRandomState(s * 7 + 3);
      expect(permParity(c.cp)).toBe(permParity(c.ep));
      expect(c.co.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(c.eo.reduce((a, b) => a + b, 0) % 2).toBe(0);
    }
  });

  it("randomScramble is reproducible, valid, and avoids same-face repeats", () => {
    const sc1 = randomScramble(25, 123);
    const sc2 = randomScramble(25, 123);
    expect(sc1.alg).toBe(sc2.alg);
    expect(validateCubie(sc1.cube).ok).toBe(true);
    const faces = sc1.moves.map((m) => Math.floor(m / 3));
    for (let i = 1; i < faces.length; i++) expect(faces[i]).not.toBe(faces[i - 1]);
  });

  it("solved cube returns 0 moves worth of change", () => {
    expect(isSolved(cloneCube(solvedCube()))).toBe(true);
  });
});

describe("MOVES table integrity", () => {
  it("has exactly 18 moves with unique names", () => {
    expect(MOVES.length).toBe(18);
    expect(MOVE_INDEX_BY_NAME.size).toBe(18);
  });
});
