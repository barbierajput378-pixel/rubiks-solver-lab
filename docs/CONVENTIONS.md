# CubeLab — Cube Conventions

These conventions are the contract every module (model, solvers, UI) relies on. They are
chosen to be internally consistent and to make the group-theoretic solvers (Thistlethwaite,
Kociemba-style) natural. The model is **derived from a 3D geometric source of truth**, so
these are descriptions of what the geometry produces, not hand-entered tables.

## Faces and colors
Face order used everywhere: **U, R, F, D, L, B** (indices 0–5).

Default color scheme is the Western / BOY scheme:

| Face | Axis normal | Color  |
|------|-------------|--------|
| U    | +y (up)     | White  |
| D    | −y (down)   | Yellow |
| F    | +z (front)  | Green  |
| B    | −z (back)   | Blue   |
| R    | +x (right)  | Red    |
| L    | −x (left)   | Orange |

Centers are fixed: a face's center sticker never moves, so the solved color of a face is the
color of its center. (This is why the scanner can self-calibrate from centers — see Phase 5.)

## Coordinate frame
Right-handed: **x** right, **y** up, **z** toward the viewer (front). Sticker centers live on
the cube surface at coordinates in `{-1, 0, 1}³`, with exactly one coordinate equal to ±1
(the face normal axis). A face turn rotates every sticker whose coordinate along the turn
axis equals that face's outer value (+1 for U/R/F, −1 for D/L/B).

## Move notation
- Faces: `U D L R F B`.
- Modifiers: clockwise = `X`, counter-clockwise (prime) = `X'`, half-turn = `X2`.
- "Clockwise" means clockwise **as seen looking at that face from outside the cube**.
- A sequence is a space-separated string, e.g. `R U R' U'` (the "sexy move").
- There are 18 moves total: 6 faces × {`X`, `X'`, `X2`}.

## Cubie model
State = `{ cp, co, ep, eo }`.

**Corners** (8), indexed by their home slot:

| idx | 0 URF | 1 UFL | 2 ULB | 3 UBR | 4 DFR | 5 DLF | 6 DBL | 7 DRB |
|-----|-------|-------|-------|-------|-------|-------|-------|-------|

- `cp[i]` = id of the corner cubie currently in slot `i`.
- `co[i]` ∈ {0,1,2} = corner twist. **0** when the cubie's U/D-colored sticker lies on the
  U or D face. `1`/`2` are successive 120° clockwise twists (right-hand rule about the slot's
  outward diagonal). Invariant: `Σ co ≡ 0 (mod 3)` for any reachable state.

**Edges** (12), indexed by their home slot:

| idx | 0 UR | 1 UF | 2 UL | 3 UB | 4 DR | 5 DF | 6 DL | 7 DB | 8 FR | 9 FL | 10 BL | 11 BR |
|-----|------|------|------|------|------|------|------|------|------|------|-------|-------|

- `ep[i]` = id of the edge cubie currently in slot `i`.
- `eo[i]` ∈ {0,1} = flip. **0** when the edge's reference sticker is on its reference face.
  Reference face is U/D for the eight U/D-layer edges, and F/B for the four E-slice edges
  (`FR, FL, BL, BR`, indices 8–11). Invariant: `Σ eo ≡ 0 (mod 2)`.
- The four **E-slice** edges (8–11) are grouped for Kociemba phase-1 (the UD-slice coordinate)
  and for Thistlethwaite.

## Permutation parity
Corner permutation parity equals edge permutation parity for any reachable state (a single
quarter turn is a 4-cycle on both corners and edges → both odd). The validity checker uses
this: `parity(cp) == parity(ep)` must hold.

## Multiplication
State composition `A · B` ("apply B after A") combines permutation and orientation:
```
(A·B).cp[i] = A.cp[B.cp[i]]
(A·B).co[i] = (A.co[B.cp[i]] + B.co[i]) mod 3
```
and analogously for edges (mod 2). The identity is the solved cube. A move is just a cube
state; applying move M to state S is `S · M`.
