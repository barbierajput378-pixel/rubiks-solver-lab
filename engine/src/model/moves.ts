/** The 18 face moves, move metadata, and sequence (algorithm) utilities. */

import { Face, FACE_NAMES } from "./types.js";
import type { CubieCube } from "./types.js";
import { multiply, cloneCube, solvedCube } from "./cubie.js";
import { QUARTER_MOVE_CUBES } from "./geometry.js";

export interface MoveDef {
  name: string; // e.g. "R", "R2", "R'"
  face: Face; // which face
  power: 1 | 2 | 3; // quarter turns clockwise (3 == prime)
  cube: CubieCube; // the move as a cube state
}

const FACE_ORDER: Face[] = [Face.U, Face.R, Face.F, Face.D, Face.L, Face.B];

function buildMoves(): MoveDef[] {
  const defs: MoveDef[] = [];
  for (const face of FACE_ORDER) {
    const q = QUARTER_MOVE_CUBES[face]!;
    const q2 = multiply(q, q);
    const q3 = multiply(q2, q);
    const base = FACE_NAMES[face];
    defs.push({ name: base, face, power: 1, cube: q });
    defs.push({ name: `${base}2`, face, power: 2, cube: q2 });
    defs.push({ name: `${base}'`, face, power: 3, cube: q3 });
  }
  return defs;
}

/** All 18 moves in the order U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'. */
export const MOVES: readonly MoveDef[] = buildMoves();

export const MOVE_INDEX_BY_NAME: ReadonlyMap<string, number> = new Map(
  MOVES.map((m, i) => [m.name, i]),
);

/** Apply a move (by index) to a state, returning a new state. */
export function applyMoveIndex(state: CubieCube, moveIdx: number): CubieCube {
  return multiply(state, MOVES[moveIdx]!.cube);
}

/** Parse an algorithm string like "R U R' U'" into move indices. */
export function parseAlg(alg: string): number[] {
  const tokens = alg.trim().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (const tok of tokens) {
    const idx = MOVE_INDEX_BY_NAME.get(tok);
    if (idx === undefined) throw new Error(`parseAlg: unknown move "${tok}"`);
    out.push(idx);
  }
  return out;
}

/** Format move indices into an algorithm string. */
export function formatAlg(moves: number[]): string {
  return moves.map((m) => MOVES[m]!.name).join(" ");
}

/** Apply a whole algorithm (string or indices) to a state. */
export function applyAlg(state: CubieCube, alg: string | number[]): CubieCube {
  const idxs = typeof alg === "string" ? parseAlg(alg) : alg;
  let c = cloneCube(state);
  for (const m of idxs) c = multiply(c, MOVES[m]!.cube);
  return c;
}

/** The inverse of a single move index (same face, complementary power). */
export function inverseMoveIndex(moveIdx: number): number {
  const m = MOVES[moveIdx]!;
  const invPower = (4 - m.power) as 1 | 2 | 3;
  // move list per face is [q, q2, q3]; base index = face position * 3
  const facePos = FACE_ORDER.indexOf(m.face);
  return facePos * 3 + (invPower - 1);
}

/** Invert an algorithm: reverse the order and invert each move. (A B)⁻¹ = B⁻¹ A⁻¹. */
export function invertAlg(moves: number[]): number[] {
  return moves.slice().reverse().map(inverseMoveIndex);
}

/** Build a cube from an algorithm applied to the solved cube. */
export function cubeFromAlg(alg: string | number[]): CubieCube {
  return applyAlg(solvedCube(), alg);
}
