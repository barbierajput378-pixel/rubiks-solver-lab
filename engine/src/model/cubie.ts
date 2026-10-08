/** Cubie-level cube algebra: identity, composition, inverse. See docs/CONVENTIONS.md. */

import type { CubieCube } from "./types.js";

export function solvedCube(): CubieCube {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export function cloneCube(c: CubieCube): CubieCube {
  return { cp: c.cp.slice(), co: c.co.slice(), ep: c.ep.slice(), eo: c.eo.slice() };
}

export function cubesEqual(a: CubieCube, b: CubieCube): boolean {
  for (let i = 0; i < 8; i++) if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  for (let i = 0; i < 12; i++) if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  return true;
}

export function isSolved(c: CubieCube): boolean {
  for (let i = 0; i < 8; i++) if (c.cp[i] !== i || c.co[i] !== 0) return false;
  for (let i = 0; i < 12; i++) if (c.ep[i] !== i || c.eo[i] !== 0) return false;
  return true;
}

/**
 * Compose two cubes: `multiply(a, b)` = apply `b` after `a` (i.e. a then b).
 * (a·b).cp[i] = a.cp[b.cp[i]]; orientation adds with the mover's permutation.
 */
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  const cp = new Array(8);
  const co = new Array(8);
  for (let i = 0; i < 8; i++) {
    cp[i] = a.cp[b.cp[i]!]!;
    co[i] = (a.co[b.cp[i]!]! + b.co[i]!) % 3;
  }
  const ep = new Array(12);
  const eo = new Array(12);
  for (let i = 0; i < 12; i++) {
    ep[i] = a.ep[b.ep[i]!]!;
    eo[i] = (a.eo[b.ep[i]!]! + b.eo[i]!) & 1;
  }
  return { cp, co, ep, eo };
}

/** In-place-free composition applying `m` onto `state`: returns state·m. */
export function applyMove(state: CubieCube, m: CubieCube): CubieCube {
  return multiply(state, m);
}

/** Inverse cube: (c⁻¹). */
export function invert(c: CubieCube): CubieCube {
  const cp = new Array(8);
  const co = new Array(8);
  for (let i = 0; i < 8; i++) {
    cp[c.cp[i]!] = i;
    // orientation of the inverse: undo the twist that c applied
    co[c.cp[i]!] = (3 - c.co[i]!) % 3;
  }
  const ep = new Array(12);
  const eo = new Array(12);
  for (let i = 0; i < 12; i++) {
    ep[c.ep[i]!] = i;
    eo[c.ep[i]!] = c.eo[i]!;
  }
  return { cp, co, ep, eo };
}

/** Permutation parity (0 even, 1 odd) of an array that is a permutation of 0..n-1. */
export function permParity(perm: number[]): number {
  const n = perm.length;
  const seen = new Array(n).fill(false);
  let parity = 0;
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    let len = 0;
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      j = perm[j]!;
      len++;
    }
    if (len % 2 === 0) parity ^= 1;
  }
  return parity;
}
