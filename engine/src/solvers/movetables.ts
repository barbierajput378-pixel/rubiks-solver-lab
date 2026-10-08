/**
 * Atomic coordinate move-transition tables and an integer product-BFS.
 *
 * Each cube coordinate (corner orientation, edge orientation, slice membership, a permutation)
 * transforms under a move as a pure function of *that coordinate alone*. Precomputing these
 * small transition tables lets us build the large phase pruning tables by fast integer BFS
 * over the product of two coordinates, instead of decoding/re-encoding full cubes per node.
 */

import { MOVES } from "../model/moves.js";
import {
  rankToOri,
  oriToRank,
  combinationRank,
  combinationUnrank,
  rankToPerm,
  permToRank,
} from "./coords.js";

export type Flat = Int32Array; // [state * nMoves + moveIdx] -> next state

export const ALL_MOVES = Array.from({ length: 18 }, (_, i) => i);

/** Corner-orientation transition table (size 2187). */
export function buildCoMove(moves: number[]): Flat {
  const nm = moves.length;
  const t = new Int32Array(2187 * nm);
  for (let co = 0; co < 2187; co++) {
    const arr = rankToOri(co, 8, 3);
    for (let mi = 0; mi < nm; mi++) {
      const m = MOVES[moves[mi]!]!.cube;
      const next = new Array(8);
      for (let i = 0; i < 8; i++) next[i] = (arr[m.cp[i]!]! + m.co[i]!) % 3;
      t[co * nm + mi] = oriToRank(next, 3);
    }
  }
  return t;
}

/** Edge-orientation transition table (size 2048). */
export function buildEoMove(moves: number[]): Flat {
  const nm = moves.length;
  const t = new Int32Array(2048 * nm);
  const decode = (eo: number) => {
    const a = new Array(12).fill(0);
    let r = eo;
    let sum = 0;
    for (let i = 10; i >= 0; i--) {
      a[i] = r & 1;
      r >>= 1;
      sum += a[i];
    }
    a[11] = sum & 1;
    return a;
  };
  const encode = (a: number[]) => {
    let r = 0;
    for (let i = 0; i < 11; i++) r = r * 2 + a[i]!;
    return r;
  };
  for (let eo = 0; eo < 2048; eo++) {
    const arr = decode(eo);
    for (let mi = 0; mi < nm; mi++) {
      const m = MOVES[moves[mi]!]!.cube;
      const next = new Array(12);
      for (let i = 0; i < 12; i++) next[i] = (arr[m.ep[i]!]! + m.eo[i]!) & 1;
      t[eo * nm + mi] = encode(next);
    }
  }
  return t;
}

/** E-slice membership transition table: which 4 of 12 edge slots hold slice edges (size 495). */
export function buildSliceCombMove(moves: number[]): Flat {
  const nm = moves.length;
  const t = new Int32Array(495 * nm);
  for (let comb = 0; comb < 495; comb++) {
    const occupied = new Array(12).fill(false);
    for (const s of combinationUnrank(comb, 12, 4)) occupied[s] = true;
    for (let mi = 0; mi < nm; mi++) {
      const m = MOVES[moves[mi]!]!.cube;
      const nextOcc: number[] = [];
      for (let i = 0; i < 12; i++) if (occupied[m.ep[i]!]) nextOcc.push(i);
      t[comb * nm + mi] = combinationRank(nextOcc, 12);
    }
  }
  return t;
}

/** Corner-permutation transition table (size 40320). */
export function buildCpMove(moves: number[]): Flat {
  const nm = moves.length;
  const t = new Int32Array(40320 * nm);
  for (let cp = 0; cp < 40320; cp++) {
    const arr = rankToPerm(cp, 8);
    for (let mi = 0; mi < nm; mi++) {
      const m = MOVES[moves[mi]!]!.cube;
      const next = new Array(8);
      for (let i = 0; i < 8; i++) next[i] = arr[m.cp[i]!]!;
      t[cp * nm + mi] = permToRank(next);
    }
  }
  return t;
}

/**
 * U/D-edge-permutation transition table (the 8 edges in slots 0..7; size 40320).
 * Only valid for moves that keep U/D edges in U/D slots (the G1 move set).
 */
export function buildUdEdgeMove(moves: number[]): Flat {
  const nm = moves.length;
  const t = new Int32Array(40320 * nm);
  for (let ud = 0; ud < 40320; ud++) {
    const arr = rankToPerm(ud, 8);
    for (let mi = 0; mi < nm; mi++) {
      const m = MOVES[moves[mi]!]!.cube;
      const next = new Array(8);
      for (let i = 0; i < 8; i++) next[i] = arr[m.ep[i]!]!;
      t[ud * nm + mi] = permToRank(next);
    }
  }
  return t;
}

/** Slice-edge-permutation transition table (4 slice edges in slots 8..11; size 24). */
export function buildSlicePermMove(moves: number[]): Flat {
  const nm = moves.length;
  const t = new Int32Array(24 * nm);
  for (let sp = 0; sp < 24; sp++) {
    const arr = rankToPerm(sp, 4); // perm over slice slots 8..11 (values 0..3)
    for (let mi = 0; mi < nm; mi++) {
      const m = MOVES[moves[mi]!]!.cube;
      const next = new Array(4);
      for (let i = 0; i < 4; i++) {
        const src = m.ep[8 + i]! - 8; // where slice slot i's content comes from (0..3)
        next[i] = arr[src]!;
      }
      t[sp * nm + mi] = permToRank(next);
    }
  }
  return t;
}

/**
 * BFS over the product of two coordinates using their atomic transition tables.
 * State index = a * sizeB + b; start state is (0,0). Returns a Uint8Array of distances.
 */
export function productBfs(
  sizeA: number,
  atomA: Flat,
  sizeB: number,
  atomB: Flat,
  nm: number,
  startIndex = 0,
): Uint8Array {
  const size = sizeA * sizeB;
  const dist = new Uint8Array(size).fill(0xff);
  dist[startIndex] = 0;
  let filled = 1;
  let depth = 0;
  // Scan-by-depth: walk (a,b) in nested loops so there is no per-node division and no frontier
  // allocation. Each level touches the whole table once (cheap array reads); total work is
  // O(size * maxDepth), which stays fast and low-memory even for the 88M-entry corner PDB.
  while (filled < size) {
    let found = 0;
    let idx = 0;
    for (let a = 0; a < sizeA; a++) {
      const baseA = a * nm;
      for (let b = 0; b < sizeB; b++, idx++) {
        if (dist[idx] !== depth) continue;
        for (let mi = 0; mi < nm; mi++) {
          const ni = atomA[baseA + mi]! * sizeB + atomB[b * nm + mi]!;
          if (dist[ni] === 0xff) {
            dist[ni] = depth + 1;
            found++;
          }
        }
      }
    }
    if (found === 0) break;
    filled += found;
    depth++;
  }
  return dist;
}
