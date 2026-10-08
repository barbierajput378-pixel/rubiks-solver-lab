/**
 * Seeded randomness for reproducibility:
 *  - `uniformRandomState`: a uniform random *valid* cube state (any of the 4.3e19).
 *  - `randomScramble`: a random-move sequence (what a human/cstimer would scramble with).
 * These are different distributions on purpose (the spec asks for both).
 */

import type { CubieCube } from "./types.js";
import { solvedCube, multiply, permParity } from "./cubie.js";
import { MOVES } from "./moves.js";

/** Deterministic 32-bit PRNG (mulberry32). Returns floats in [0,1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * A uniform random valid state. Permutations are uniform; orientations have their last
 * element pinned to satisfy Σco≡0 (mod 3) and Σeo≡0 (mod 2); permutation parities are
 * equalized by one edge swap when needed. This is the standard construction and is
 * uniform over the set of solvable states.
 */
export function uniformRandomState(seed: number): CubieCube {
  const rng = makeRng(seed);

  const cp = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng);
  const ep = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rng);

  // Equalize permutation parity by swapping two edges if needed.
  if (permParity(cp) !== permParity(ep)) {
    [ep[0], ep[1]] = [ep[1]!, ep[0]!];
  }

  const co = new Array(8).fill(0);
  let csum = 0;
  for (let i = 0; i < 7; i++) {
    co[i] = Math.floor(rng() * 3);
    csum += co[i];
  }
  co[7] = (3 - (csum % 3)) % 3;

  const eo = new Array(12).fill(0);
  let esum = 0;
  for (let i = 0; i < 11; i++) {
    eo[i] = Math.floor(rng() * 2);
    esum += eo[i];
  }
  eo[11] = esum & 1;

  return { cp, co, ep, eo };
}

export interface Scramble {
  moves: number[];
  alg: string;
  cube: CubieCube;
}

/**
 * A random-move scramble of `length` turns. Avoids putting two turns of the same face in a
 * row, and avoids a turn on the same axis as both of the previous two (which would be
 * reducible), so the move count is honest.
 */
export function randomScramble(length: number, seed: number): Scramble {
  const rng = makeRng(seed);
  const axisOf = (face: number) => face % 3; // U/D=0? see below
  // MOVES order groups 3 per face: U,R,F,D,L,B. Face index = floor(moveIdx/3).
  const faceOfMove = (m: number) => Math.floor(m / 3);
  // Opposite-face axis grouping: U&D, R&L, F&B share an axis.
  const axisOfFace = (f: number) => [0, 1, 2, 0, 1, 2][f]!; // U,R,F,D,L,B -> 0,1,2,0,1,2
  void axisOf;

  const moves: number[] = [];
  let prevFace = -1;
  let prevPrevFace = -1;
  while (moves.length < length) {
    const m = Math.floor(rng() * MOVES.length);
    const f = faceOfMove(m);
    if (f === prevFace) continue; // no two turns of the same face in a row
    if (axisOfFace(f) === axisOfFace(prevFace) && axisOfFace(f) === axisOfFace(prevPrevFace)) continue;
    moves.push(m);
    prevPrevFace = prevFace;
    prevFace = f;
  }

  let cube = solvedCube();
  for (const m of moves) cube = multiply(cube, MOVES[m]!.cube);
  return { moves, alg: moves.map((m) => MOVES[m]!.name).join(" "), cube };
}
