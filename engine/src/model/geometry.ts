/**
 * Geometric source of truth for the cube model.
 *
 * Every facelet is given a real 3D position and outward normal. Face turns are
 * actual 90° rotations of the affected layer. The cubie-level move tables
 * (permutation + orientation) are *derived* by applying a facelet rotation to the
 * solved cube and decoding the result — so no orientation constants are hand-entered,
 * which is the usual source of sign bugs. See docs/CONVENTIONS.md.
 */

import {
  Face,
  N_FACELETS,
  type CubieCube,
  type FaceletCube,
} from "./types.js";

type Vec3 = [number, number, number];

const AXIS = { x: 0, y: 1, z: 2 } as const;

// Per-face geometry: axis of the normal and its outer sign (+1 for U/R/F, -1 for D/L/B).
// Order must match Face enum: U, R, F, D, L, B.
const FACE_AXIS: { axis: number; sign: number }[] = [
  { axis: AXIS.y, sign: +1 }, // U
  { axis: AXIS.x, sign: +1 }, // R
  { axis: AXIS.z, sign: +1 }, // F
  { axis: AXIS.y, sign: -1 }, // D
  { axis: AXIS.x, sign: -1 }, // L
  { axis: AXIS.z, sign: -1 }, // B
];

/** Position of facelet (face,row,col) consistent with the standard unfolded net. */
function faceletPosition(face: Face, row: number, col: number): Vec3 {
  switch (face) {
    case Face.U:
      return [col - 1, 1, row - 1];
    case Face.D:
      return [col - 1, -1, 1 - row];
    case Face.F:
      return [col - 1, 1 - row, 1];
    case Face.B:
      return [1 - col, 1 - row, -1];
    case Face.R:
      return [1, 1 - row, 1 - col];
    case Face.L:
      return [-1, 1 - row, col - 1];
  }
}

function faceNormal(face: Face): Vec3 {
  const { axis, sign } = FACE_AXIS[face]!;
  const n: Vec3 = [0, 0, 0];
  n[axis] = sign;
  return n;
}

// Build the 54 facelets: position + normal, indexed face*9 + row*3 + col.
const facePos: Vec3[] = [];
const faceNorm: Vec3[] = [];
for (let f = 0; f < 6; f++) {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      facePos.push(faceletPosition(f as Face, row, col));
      faceNorm.push(faceNormal(f as Face));
    }
  }
}

/** Rotate an integer vector by `quarter` * 90° (right-handed) about `axis`. */
function rot(v: Vec3, axis: number, quarter: number): Vec3 {
  let [x, y, z] = v;
  let q = ((quarter % 4) + 4) % 4;
  for (let i = 0; i < q; i++) {
    // +90° right-handed rotations
    if (axis === AXIS.x) [y, z] = [-z, y];
    else if (axis === AXIS.y) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

const keyPN = (p: Vec3, n: Vec3) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
const posNormToIndex = new Map<string, number>();
for (let i = 0; i < N_FACELETS; i++) {
  posNormToIndex.set(keyPN(facePos[i]!, faceNorm[i]!), i);
}

/**
 * Facelet permutation for a clockwise (from outside) quarter turn of `face`.
 * `perm[i]` = source facelet that moves into slot i. Clockwise-from-outside is a
 * rotation of -sign*90° about the +axis (verified: U sends UF→UL).
 */
function buildFaceletMove(face: Face): number[] {
  const { axis, sign } = FACE_AXIS[face]!;
  const quarter = -sign; // clockwise from outside
  const perm = Array.from({ length: N_FACELETS }, (_, i) => i);
  for (let j = 0; j < N_FACELETS; j++) {
    if (facePos[j]![axis] !== sign) continue; // not in the turning layer
    const np = rot(facePos[j]!, axis, quarter);
    const nn = rot(faceNorm[j]!, axis, quarter);
    const k = posNormToIndex.get(keyPN(np, nn));
    if (k === undefined) throw new Error(`geometry: lost facelet ${j} on move ${face}`);
    perm[k] = j;
  }
  return perm;
}

/** Facelet permutations for the six clockwise quarter turns, indexed by Face. */
export const FACELET_MOVE: readonly number[][] = [
  buildFaceletMove(Face.U),
  buildFaceletMove(Face.R),
  buildFaceletMove(Face.F),
  buildFaceletMove(Face.D),
  buildFaceletMove(Face.L),
  buildFaceletMove(Face.B),
];

/** The solved facelet cube: facelet i shows the color of its own face. */
export const SOLVED_FACELETS: FaceletCube = Array.from(
  { length: N_FACELETS },
  (_, i) => Math.floor(i / 9) as Face,
);

export function applyFaceletMove(state: FaceletCube, move: number[]): FaceletCube {
  return move.map((src) => state[src]!);
}

// --- Cubie slot geometry -----------------------------------------------------

// Corner slot positions in cubie index order (URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB).
const CORNER_POS: Vec3[] = [
  [1, 1, 1], // URF
  [-1, 1, 1], // UFL
  [-1, 1, -1], // ULB
  [1, 1, -1], // UBR
  [1, -1, 1], // DFR
  [-1, -1, 1], // DLF
  [-1, -1, -1], // DBL
  [1, -1, -1], // DRB
];

// Edge slot positions in cubie index order (UR,UF,UL,UB,DR,DF,DL,DB,FR,FL,BL,BR).
const EDGE_POS: Vec3[] = [
  [1, 1, 0], // UR
  [0, 1, 1], // UF
  [-1, 1, 0], // UL
  [0, 1, -1], // UB
  [1, -1, 0], // DR
  [0, -1, 1], // DF
  [-1, -1, 0], // DL
  [0, -1, -1], // DB
  [1, 0, 1], // FR
  [-1, 0, 1], // FL
  [-1, 0, -1], // BL
  [1, 0, -1], // BR
];

const facIndexByPosNorm = (p: Vec3, n: Vec3): number => {
  const k = posNormToIndex.get(keyPN(p, n));
  if (k === undefined) throw new Error(`no facelet at ${keyPN(p, n)}`);
  return k;
};

/** The three facelets of a corner slot, orbit-ordered: [±y facelet, then +120° about +P]. */
function cornerSlotFacelets(slot: number): [number, number, number] {
  const P = CORNER_POS[slot]!;
  // normals present at this corner = the three axis directions matching P's signs
  const yNorm: Vec3 = [0, P[1], 0];
  // orbit of the y-normal under +120° rotation about the P diagonal (x->y->z->x)
  const orbit = rotateAboutDiagonal(yNorm, P);
  return [
    facIndexByPosNorm(P, orbit[0]),
    facIndexByPosNorm(P, orbit[1]),
    facIndexByPosNorm(P, orbit[2]),
  ];
}

/**
 * Orbit of a normal under a true 120° right-handed rotation about the +P body diagonal.
 * Realized exactly (integer) by conjugating the (1,1,1) rotation with the sign-flip S that
 * maps (1,1,1)→P; because S has determinant dx·dy·dz, octants with a negative product use
 * the reversed axis cycle so the handedness stays globally consistent (this is what makes
 * the additive corner-twist cocycle hold, i.e. R/F/L/B get order 4).
 */
function rotateAboutDiagonal(n: Vec3, P: Vec3): [Vec3, Vec3, Vec3] {
  const sx = Math.sign(P[0]) || 1;
  const sy = Math.sign(P[1]) || 1;
  const sz = Math.sign(P[2]) || 1;
  const step = (v: Vec3): Vec3 => {
    const a = v[0] * sx;
    const b = v[1] * sy;
    const c = v[2] * sz;
    // S-frame rotation about (1,1,1): +120° is (x,y,z)->(z,x,y); flip to -120° for det(S)<0
    const r: Vec3 = sx * sy * sz > 0 ? [c, a, b] : [b, c, a];
    return [r[0] * sx, r[1] * sy, r[2] * sz];
  };
  const n1 = step(n);
  const n2 = step(n1);
  return [n, n1, n2];
}

/** The two facelets of an edge slot, reference-first (ref = ±y for U/D edges, else ±z). */
function edgeSlotFacelets(slot: number): [number, number] {
  const P = EDGE_POS[slot]!;
  const norms: Vec3[] = [];
  for (let axis = 0; axis < 3; axis++) {
    if (P[axis] !== 0) {
      const n: Vec3 = [0, 0, 0];
      n[axis] = P[axis]!;
      norms.push(n);
    }
  }
  // reference = y-facelet if present (U/D edge), else z-facelet (slice edge)
  const refFirst = norms.sort((a, b) => {
    const rank = (n: Vec3) => (n[1] !== 0 ? 0 : n[2] !== 0 ? 1 : 2);
    return rank(a) - rank(b);
  });
  return [facIndexByPosNorm(P, refFirst[0]!), facIndexByPosNorm(P, refFirst[1]!)];
}

export const CORNER_FACELETS: [number, number, number][] = CORNER_POS.map((_, i) =>
  cornerSlotFacelets(i),
);
export const EDGE_FACELETS: [number, number][] = EDGE_POS.map((_, i) => edgeSlotFacelets(i));

// Solved color-sets used to identify which cubie sits in a slot.
const cornerColorKey = (cols: number[]) => [...cols].sort((a, b) => a - b).join(",");
const CORNER_ID_BY_COLORS = new Map<string, number>();
const CORNER_REF_COLOR: number[] = [];
for (let id = 0; id < 8; id++) {
  const fs = CORNER_FACELETS[id]!;
  const cols = fs.map((f) => SOLVED_FACELETS[f]!);
  CORNER_ID_BY_COLORS.set(cornerColorKey(cols), id);
  CORNER_REF_COLOR[id] = SOLVED_FACELETS[fs[0]]!; // U/D color of this corner
}
const EDGE_ID_BY_COLORS = new Map<string, number>();
const EDGE_REF_COLOR: number[] = [];
for (let id = 0; id < 12; id++) {
  const fs = EDGE_FACELETS[id]!;
  const cols = fs.map((f) => SOLVED_FACELETS[f]!);
  EDGE_ID_BY_COLORS.set(cornerColorKey(cols), id);
  EDGE_REF_COLOR[id] = SOLVED_FACELETS[fs[0]]!;
}

/** Decode a facelet cube into the cubie model. Throws if a slot's colors are not a real piece. */
export function faceletToCubie(fc: FaceletCube): CubieCube {
  const cp = new Array(8).fill(0);
  const co = new Array(8).fill(0);
  const ep = new Array(12).fill(0);
  const eo = new Array(12).fill(0);

  for (let slot = 0; slot < 8; slot++) {
    const fs = CORNER_FACELETS[slot]!;
    const cols = fs.map((f) => fc[f]!);
    const id = CORNER_ID_BY_COLORS.get(cornerColorKey(cols));
    if (id === undefined) throw new Error(`corner slot ${slot}: colors ${cols} are not a corner`);
    cp[slot] = id;
    // twist = orbit index where the U/D-colored sticker sits
    const udColor = CORNER_REF_COLOR[id]!;
    const twist = fs.findIndex((f) => fc[f] === udColor);
    co[slot] = twist;
  }

  for (let slot = 0; slot < 12; slot++) {
    const fs = EDGE_FACELETS[slot]!;
    const cols = fs.map((f) => fc[f]!);
    const id = EDGE_ID_BY_COLORS.get(cornerColorKey(cols));
    if (id === undefined) throw new Error(`edge slot ${slot}: colors ${cols} are not an edge`);
    ep[slot] = id;
    eo[slot] = fc[fs[0]!] === EDGE_REF_COLOR[id]! ? 0 : 1;
  }

  return { cp, co, ep, eo };
}

/** Encode the cubie model back to a facelet cube (inverse of faceletToCubie). */
export function cubieToFacelet(cube: CubieCube): FaceletCube {
  // Seed with the solved cube so the six fixed center facelets carry their face color.
  const fc: FaceletCube = SOLVED_FACELETS.slice();
  for (let slot = 0; slot < 8; slot++) {
    const id = cube.cp[slot]!;
    const twist = cube.co[slot]!;
    const slotF = CORNER_FACELETS[slot]!;
    const homeF = CORNER_FACELETS[id]!;
    for (let j = 0; j < 3; j++) {
      fc[slotF[(j + twist) % 3]!] = SOLVED_FACELETS[homeF[j]!]!;
    }
  }
  for (let slot = 0; slot < 12; slot++) {
    const id = cube.ep[slot]!;
    const flip = cube.eo[slot]!;
    const slotF = EDGE_FACELETS[slot]!;
    const homeF = EDGE_FACELETS[id]!;
    for (let j = 0; j < 2; j++) {
      fc[slotF[(j + flip) % 2]!] = SOLVED_FACELETS[homeF[j]!]!;
    }
  }
  return fc;
}

/** The six clockwise quarter-turn cubie moves, derived from the facelet geometry. */
export const QUARTER_MOVE_CUBES: CubieCube[] = FACELET_MOVE.map((m) =>
  faceletToCubie(applyFaceletMove(SOLVED_FACELETS, m)),
);

// --- Helpers for the validity checker (tolerant identification) --------------

const colorKey = (cols: number[]) => [...cols].sort((a, b) => a - b).join(",");

/** Identify a corner id from the three colors at a slot, or undefined if not a real corner. */
export function cornerIdFromColors(cols: number[]): number | undefined {
  return CORNER_ID_BY_COLORS.get(colorKey(cols));
}
/** Identify an edge id from the two colors at a slot, or undefined if not a real edge. */
export function edgeIdFromColors(cols: number[]): number | undefined {
  return EDGE_ID_BY_COLORS.get(colorKey(cols));
}
/** The U/D-face color of corner `id` in the solved cube (orientation reference). */
export function cornerUDColor(id: number): number {
  return CORNER_REF_COLOR[id]!;
}
/** The reference-face color of edge `id` in the solved cube (flip reference). */
export function edgeReferenceColor(id: number): number {
  return EDGE_REF_COLOR[id]!;
}
