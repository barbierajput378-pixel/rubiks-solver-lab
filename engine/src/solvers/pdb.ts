/**
 * Pattern databases (Korf-style additive heuristics).
 *
 * A coordinate projects the cube onto a subset of pieces (corners, or a 6-edge group) and is
 * bijective on that subset, so a backward BFS from the solved state fills an exact
 * solved-distance table over the projection. Each table is an *admissible* lower bound on the
 * real distance; combining several is done with `max` (see docs/RESEARCH.md — the groups
 * overlap, so summing would overestimate).
 */

import type { CubieCube } from "../model/types.js";
import { solvedCube, multiply } from "../model/cubie.js";
import { MOVES } from "../model/moves.js";
import {
  permToRank,
  rankToPerm,
  oriToRank,
  rankToOri,
  markedPermToRank,
  markedPermFromRank,
  factorial,
  binomial,
} from "./coords.js";

/** A bijective projection of the cube onto some pieces. */
export interface Coordinate {
  name: string;
  size: number;
  encode(cube: CubieCube): number;
  /** A representative cube with this coordinate value (other pieces arbitrary but valid). */
  decode(index: number): CubieCube;
}

// ---- Corner coordinate (all 8 corners): 8! * 3^7 = 88,179,840 --------------
export const CornerCoord: Coordinate = {
  name: "corners",
  size: factorial(8) * 2187,
  encode(cube) {
    return permToRank(cube.cp) * 2187 + oriToRank(cube.co, 3);
  },
  decode(index) {
    const cp = rankToPerm(Math.floor(index / 2187), 8);
    const co = rankToOri(index % 2187, 8, 3);
    const c = solvedCube();
    c.cp = cp;
    c.co = co;
    return c;
  },
};

// ---- Corner-orientation coordinate (3^7 = 2187): small, used for fast tests --
export const CornerOrientationCoord: Coordinate = {
  name: "corner-orientation",
  size: 2187,
  encode(cube) {
    return oriToRank(cube.co, 3);
  },
  decode(index) {
    const c = solvedCube();
    c.co = rankToOri(index, 8, 3);
    return c;
  },
};

// ---- Edge-orientation coordinate (2^11 = 2048): small ----------------------
export const EdgeOrientationCoord: Coordinate = {
  name: "edge-orientation",
  size: 2048,
  encode(cube) {
    let r = 0;
    for (let i = 0; i < 11; i++) r = r * 2 + cube.eo[i]!;
    return r;
  },
  decode(index) {
    const c = solvedCube();
    const eo = new Array(12).fill(0);
    let r = index;
    let sum = 0;
    for (let i = 10; i >= 0; i--) {
      eo[i] = r & 1;
      r >>= 1;
      sum += eo[i];
    }
    eo[11] = sum & 1;
    c.eo = eo;
    return c;
  },
};

/**
 * Edge-subset coordinate for a set of 6 edge ids: their positions+permutation
 * (C(12,6)·6! = 665,280) times their orientations (2^6 = 64) = 42,577,920.
 */
export function makeEdgeSubsetCoord(subset: number[]): Coordinate {
  if (subset.length !== 6) throw new Error("edge subset must be size 6");
  const inSubset = new Array(12).fill(-1);
  subset.forEach((id, i) => (inSubset[id] = i));
  const posSize = binomial(12, 6) * factorial(6);
  return {
    name: `edges-${subset.join("-")}`,
    size: posSize * 64,
    encode(cube) {
      const items = new Array(12).fill(-1);
      const flips = new Array(6).fill(0);
      for (let slot = 0; slot < 12; slot++) {
        const id = cube.ep[slot]!;
        const marker = inSubset[id];
        if (marker >= 0) {
          items[slot] = marker;
          flips[marker] = cube.eo[slot]!;
        }
      }
      const posRank = markedPermToRank(items, 12, 6);
      let oriRank = 0;
      for (let i = 0; i < 6; i++) oriRank = oriRank * 2 + flips[i]!;
      return posRank * 64 + oriRank;
    },
    decode(index) {
      const posRank = Math.floor(index / 64);
      const oriRank = index % 64;
      const items = markedPermFromRank(posRank, 12, 6); // slot -> marker or -1
      const c = solvedCube();
      const ep = new Array(12).fill(-1);
      const eo = new Array(12).fill(0);
      // place marked edges
      const flips = new Array(6).fill(0);
      for (let i = 5; i >= 0; i--) {
        flips[i] = (oriRank >> (5 - i)) & 1;
      }
      for (let slot = 0; slot < 12; slot++) {
        const marker = items[slot]!;
        if (marker >= 0) {
          ep[slot] = subset[marker]!;
          eo[slot] = flips[marker]!;
        }
      }
      // fill the rest with the non-subset edge ids in order
      const remaining = [];
      for (let id = 0; id < 12; id++) if (inSubset[id] < 0) remaining.push(id);
      let ri = 0;
      for (let slot = 0; slot < 12; slot++) if (ep[slot] < 0) ep[slot] = remaining[ri++]!;
      c.ep = ep;
      c.eo = eo;
      return c;
    },
  };
}

export interface Pdb {
  name: string;
  size: number;
  table: Uint8Array;
  lookup(cube: CubieCube): number;
}

export interface BuildProgress {
  name: string;
  filled: number;
  size: number;
  depth: number;
}

/**
 * Build a pattern database by breadth-first search outward from the solved state over the
 * coordinate graph. `moves` are the MOVES indices to use (default all 18).
 */
export function buildPdb(
  coord: Coordinate,
  moves: number[] = Array.from({ length: 18 }, (_, i) => i),
  onProgress?: (p: BuildProgress) => void,
): Pdb {
  const table = new Uint8Array(coord.size).fill(0xff);
  const moveCubes = moves.map((m) => MOVES[m]!.cube);
  const startIndex = coord.encode(solvedCube());
  table[startIndex] = 0;
  let frontier: number[] = [startIndex];
  let filled = 1;
  let depth = 0;
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const idx of frontier) {
      const cube = coord.decode(idx);
      for (const mc of moveCubes) {
        const child = multiply(cube, mc);
        const ci = coord.encode(child);
        if (table[ci] === 0xff) {
          table[ci] = depth + 1;
          filled++;
          next.push(ci);
        }
      }
    }
    depth++;
    frontier = next;
    onProgress?.({ name: coord.name, filled, size: coord.size, depth });
  }
  return {
    name: coord.name,
    size: coord.size,
    table,
    lookup(cube: CubieCube) {
      return table[coord.encode(cube)]!;
    },
  };
}

/** Combine pattern databases into one admissible heuristic by taking the maximum. */
export function maxHeuristic(pdbs: Pdb[]): (cube: CubieCube) => number {
  return (cube: CubieCube) => {
    let h = 0;
    for (const p of pdbs) {
      const v = p.lookup(cube);
      if (v > h) h = v;
    }
    return h;
  };
}

/** The two standard Korf 6-edge groups. */
export const EDGE_GROUP_A = [0, 1, 2, 3, 4, 5]; // UR UF UL UB DR DF
export const EDGE_GROUP_B = [6, 7, 8, 9, 10, 11]; // DL DB FR FL BL BR
