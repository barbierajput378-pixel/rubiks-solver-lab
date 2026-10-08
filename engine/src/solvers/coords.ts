/**
 * Ranking / unranking utilities for cube coordinates, shared by the search solvers and
 * pattern databases. All are O(n) or O(n²) over tiny n, and exact (bijective).
 */

/** Lehmer-code rank of a permutation of 0..n-1 → [0, n!). */
export function permToRank(perm: number[]): number {
  const n = perm.length;
  let rank = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (perm[j]! < perm[i]!) smaller++;
    rank = rank * (n - i) + smaller;
  }
  return rank;
}

/** Inverse of permToRank: rank → permutation of 0..n-1. */
export function rankToPerm(rank: number, n: number): number[] {
  const perm = new Array(n).fill(0);
  const elems: number[] = [];
  for (let i = 0; i < n; i++) elems.push(i);
  // factorial base
  const fact: number[] = [1];
  for (let i = 1; i <= n; i++) fact[i] = fact[i - 1]! * i;
  let r = rank;
  for (let i = 0; i < n; i++) {
    const f = fact[n - 1 - i]!;
    const idx = Math.floor(r / f);
    r %= f;
    perm[i] = elems.splice(idx, 1)[0]!;
  }
  return perm;
}

/** Orientation vector (each in [0,base)) of the first n-1 entries → [0, base^(n-1)). */
export function oriToRank(ori: number[], base: number): number {
  let rank = 0;
  for (let i = 0; i < ori.length - 1; i++) rank = rank * base + ori[i]!;
  return rank;
}

/** Inverse: rank → orientation vector of length n, with the last entry fixed by the sum rule. */
export function rankToOri(rank: number, n: number, base: number): number[] {
  const ori = new Array(n).fill(0);
  let r = rank;
  let sum = 0;
  for (let i = n - 2; i >= 0; i--) {
    ori[i] = r % base;
    r = Math.floor(r / base);
    sum += ori[i];
  }
  ori[n - 1] = (base - (sum % base)) % base;
  return ori;
}

/**
 * Rank the choice of which k of n positions are occupied by a marked set, combined with the
 * permutation of the marked items among those positions. Used for 6-edge pattern databases
 * and the UD-slice coordinate.
 *
 * `items[i]` = marker id (0..k-1) if position i holds a marked item, else -1.
 * Returns an index in [0, C(n,k) * k!).
 */
export function markedPermToRank(items: number[], n: number, k: number): number {
  // combination rank (which positions are occupied) + permutation rank of the markers
  const occupied: number[] = [];
  const markerOrder: number[] = [];
  for (let i = 0; i < n; i++) {
    if (items[i]! >= 0) {
      occupied.push(i);
      markerOrder.push(items[i]!);
    }
  }
  const combRank = combinationRank(occupied, n);
  const permRank = permToRank(markerOrder);
  return combRank * factorial(k) + permRank;
}

/** Rank a sorted (ascending) subset `chosen` of {0..n-1} → [0, C(n,|chosen|)). */
export function combinationRank(chosen: number[], n: number): number {
  const k = chosen.length;
  let rank = 0;
  let prev = -1;
  for (let i = 0; i < k; i++) {
    for (let v = prev + 1; v < chosen[i]!; v++) rank += binomial(n - 1 - v, k - 1 - i);
    prev = chosen[i]!;
  }
  return rank;
}

/** Inverse of combinationRank: rank → sorted subset of size k from {0..n-1}. */
export function combinationUnrank(rank: number, n: number, k: number): number[] {
  const result: number[] = [];
  let x = 0;
  let r = rank;
  for (let i = 0; i < k; i++) {
    while (true) {
      const c = binomial(n - 1 - x, k - 1 - i);
      if (r < c) break;
      r -= c;
      x++;
    }
    result.push(x);
    x++;
  }
  return result;
}

/** Inverse of markedPermToRank: rank → items array (slot → marker id 0..k-1, or -1). */
export function markedPermFromRank(rank: number, n: number, k: number): number[] {
  const kf = factorial(k);
  const combRank = Math.floor(rank / kf);
  const permRank = rank % kf;
  const positions = combinationUnrank(combRank, n, k);
  const markerOrder = rankToPerm(permRank, k);
  const items = new Array(n).fill(-1);
  for (let i = 0; i < k; i++) items[positions[i]!] = markerOrder[i]!;
  return items;
}

const binomCache = new Map<number, number>();
export function binomial(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  const key = n * 100 + k;
  const cached = binomCache.get(key);
  if (cached !== undefined) return cached;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  const v = Math.round(r);
  binomCache.set(key, v);
  return v;
}

const factCache = [1];
export function factorial(n: number): number {
  for (let i = factCache.length; i <= n; i++) factCache[i] = factCache[i - 1]! * i;
  return factCache[n]!;
}
