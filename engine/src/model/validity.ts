/**
 * Structured validity checker. Works on a facelet cube (what a user paints) and
 * returns *every* reason it is invalid, not just a boolean — so the Smart Validity
 * Doctor (Phase 5) can explain and suggest minimal fixes.
 */

import { Face, FACE_NAMES, type FaceletCube, type CubieCube } from "./types.js";
import {
  CORNER_FACELETS,
  EDGE_FACELETS,
  cornerIdFromColors,
  edgeIdFromColors,
  cornerUDColor,
  edgeReferenceColor,
} from "./geometry.js";
import { permParity } from "./cubie.js";

export type ValidityReason =
  | { code: "BAD_COLOR_COUNT"; color: string; count: number }
  | { code: "NOT_A_CORNER"; slot: number; colors: string[] }
  | { code: "NOT_AN_EDGE"; slot: number; colors: string[] }
  | { code: "DUPLICATE_CORNER"; cornerId: number; slots: number[] }
  | { code: "DUPLICATE_EDGE"; edgeId: number; slots: number[] }
  | { code: "CORNER_TWIST"; sumMod3: number }
  | { code: "EDGE_FLIP"; sumMod2: number }
  | { code: "PERMUTATION_PARITY"; cornerParity: number; edgeParity: number };

export interface ValidityResult {
  ok: boolean;
  reasons: ValidityReason[];
  message: string;
  /** Present only when the state is a complete, well-formed cube (even if unsolvable). */
  cube?: CubieCube;
}

function humanReason(r: ValidityReason): string {
  switch (r.code) {
    case "BAD_COLOR_COUNT":
      return `Color ${r.color} appears ${r.count} times (should be 9).`;
    case "NOT_A_CORNER":
      return `Corner slot ${r.slot} has colors ${r.colors.join("/")}, which is not a real corner.`;
    case "NOT_AN_EDGE":
      return `Edge slot ${r.slot} has colors ${r.colors.join("/")}, which is not a real edge.`;
    case "DUPLICATE_CORNER":
      return `Two corners are identical (slots ${r.slots.join(" & ")}); a piece is missing elsewhere.`;
    case "DUPLICATE_EDGE":
      return `Two edges are identical (slots ${r.slots.join(" & ")}); a piece is missing elsewhere.`;
    case "CORNER_TWIST":
      return `A corner is twisted: total corner twist is ${r.sumMod3} mod 3 (must be 0). This cannot be solved without peeling a sticker.`;
    case "EDGE_FLIP":
      return `An edge is flipped: total edge flip is ${r.sumMod2} mod 2 (must be 0). This cannot be solved without peeling a sticker.`;
    case "PERMUTATION_PARITY":
      return `Two pieces are swapped: corner permutation parity (${r.cornerParity}) ≠ edge permutation parity (${r.edgeParity}).`;
  }
}

export function validateFacelets(fc: FaceletCube): ValidityResult {
  const reasons: ValidityReason[] = [];

  // 1. Color counts.
  const counts = new Array(6).fill(0);
  for (const c of fc) counts[c]++;
  for (let f = 0; f < 6; f++) {
    if (counts[f] !== 9) reasons.push({ code: "BAD_COLOR_COUNT", color: FACE_NAMES[f as Face], count: counts[f] });
  }

  // 2. Corners: identify + duplicates.
  const cp = new Array(8).fill(-1);
  const co = new Array(8).fill(0);
  const cornerSlotsById = new Map<number, number[]>();
  for (let slot = 0; slot < 8; slot++) {
    const fs = CORNER_FACELETS[slot]!;
    const cols = fs.map((f) => fc[f]!);
    const id = cornerIdFromColors(cols);
    if (id === undefined) {
      reasons.push({ code: "NOT_A_CORNER", slot, colors: cols.map((c) => FACE_NAMES[c as Face]) });
      continue;
    }
    cp[slot] = id;
    co[slot] = fs.findIndex((f) => fc[f] === cornerUDColor(id));
    const arr = cornerSlotsById.get(id) ?? [];
    arr.push(slot);
    cornerSlotsById.set(id, arr);
  }
  for (const [id, slots] of cornerSlotsById) if (slots.length > 1) reasons.push({ code: "DUPLICATE_CORNER", cornerId: id, slots });

  // 3. Edges: identify + duplicates.
  const ep = new Array(12).fill(-1);
  const eo = new Array(12).fill(0);
  const edgeSlotsById = new Map<number, number[]>();
  for (let slot = 0; slot < 12; slot++) {
    const fs = EDGE_FACELETS[slot]!;
    const cols = fs.map((f) => fc[f]!);
    const id = edgeIdFromColors(cols);
    if (id === undefined) {
      reasons.push({ code: "NOT_AN_EDGE", slot, colors: cols.map((c) => FACE_NAMES[c as Face]) });
      continue;
    }
    ep[slot] = id;
    eo[slot] = fc[fs[0]!] === edgeReferenceColor(id) ? 0 : 1;
    const arr = edgeSlotsById.get(id) ?? [];
    arr.push(slot);
    edgeSlotsById.set(id, arr);
  }
  for (const [id, slots] of edgeSlotsById) if (slots.length > 1) reasons.push({ code: "DUPLICATE_EDGE", edgeId: id, slots });

  // 4. Only when every piece is present exactly once can we check the three invariants.
  const cornersComplete = cp.every((x) => x >= 0) && cornerSlotsById.size === 8;
  const edgesComplete = ep.every((x) => x >= 0) && edgeSlotsById.size === 12;

  let cube: CubieCube | undefined;
  if (cornersComplete && edgesComplete) {
    const twist = co.reduce((a, b) => a + b, 0) % 3;
    if (twist !== 0) reasons.push({ code: "CORNER_TWIST", sumMod3: twist });
    const flip = eo.reduce((a, b) => a + b, 0) % 2;
    if (flip !== 0) reasons.push({ code: "EDGE_FLIP", sumMod2: flip });
    const cParity = permParity(cp);
    const eParity = permParity(ep);
    if (cParity !== eParity) reasons.push({ code: "PERMUTATION_PARITY", cornerParity: cParity, edgeParity: eParity });
    cube = { cp, co, ep, eo };
  }

  const ok = reasons.length === 0;
  return {
    ok,
    reasons,
    message: ok ? "Valid, solvable cube." : reasons.map(humanReason).join(" "),
    ...(ok && cube ? { cube } : {}),
  };
}

/** Validate a cube already in cubie form (assumes pieces are a valid permutation). */
export function validateCubie(cube: CubieCube): ValidityResult {
  const reasons: ValidityReason[] = [];
  const twist = cube.co.reduce((a, b) => a + b, 0) % 3;
  if (twist !== 0) reasons.push({ code: "CORNER_TWIST", sumMod3: twist });
  const flip = cube.eo.reduce((a, b) => a + b, 0) % 2;
  if (flip !== 0) reasons.push({ code: "EDGE_FLIP", sumMod2: flip });
  const cParity = permParity(cube.cp);
  const eParity = permParity(cube.ep);
  if (cParity !== eParity) reasons.push({ code: "PERMUTATION_PARITY", cornerParity: cParity, edgeParity: eParity });
  const ok = reasons.length === 0;
  return { ok, reasons, message: ok ? "Valid, solvable cube." : reasons.map(humanReason).join(" "), ...(ok ? { cube } : {}) };
}

export { humanReason };
