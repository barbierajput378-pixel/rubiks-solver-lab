/** Core cube types shared across the model and solvers. */

/** Face indices in canonical order U, R, F, D, L, B. */
export enum Face {
  U = 0,
  R = 1,
  F = 2,
  D = 3,
  L = 4,
  B = 5,
}

export const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;
export type FaceName = (typeof FACE_NAMES)[number];

/** Default Western/BOY color per face (hex), indexed by Face. */
export const DEFAULT_FACE_COLORS: readonly string[] = [
  "#f8f8f8", // U white
  "#c8102e", // R red
  "#009b48", // F green
  "#ffd500", // D yellow
  "#ff5800", // L orange
  "#0046ad", // B blue
];

/**
 * A cube state in the cubie (corner/edge) model.
 * - cp[i]/ep[i]: id of the piece in slot i
 * - co[i] in {0,1,2}: corner twist; eo[i] in {0,1}: edge flip
 * See docs/CONVENTIONS.md for slot ordering and orientation references.
 */
export interface CubieCube {
  cp: number[]; // length 8
  co: number[]; // length 8
  ep: number[]; // length 12
  eo: number[]; // length 12
}

/** A facelet state: 54 face-colors (Face values), 9 per face in U,R,F,D,L,B order. */
export type FaceletCube = Face[]; // length 54

export const N_CORNERS = 8;
export const N_EDGES = 12;
export const N_FACELETS = 54;

/** Corner slot names, index-aligned with the cubie model. */
export const CORNER_NAMES = [
  "URF",
  "UFL",
  "ULB",
  "UBR",
  "DFR",
  "DLF",
  "DBL",
  "DRB",
] as const;

/** Edge slot names, index-aligned with the cubie model. */
export const EDGE_NAMES = [
  "UR",
  "UF",
  "UL",
  "UB",
  "DR",
  "DF",
  "DL",
  "DB",
  "FR",
  "FL",
  "BL",
  "BR",
] as const;

/** Indices of the four E-slice (UD-slice) edges: FR, FL, BL, BR. */
export const E_SLICE_EDGES = [8, 9, 10, 11] as const;
