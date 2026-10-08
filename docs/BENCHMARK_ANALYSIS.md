# Benchmark analysis

Generated 2026-10-08 with seed 42: 30 scrambles at each requested depth (5, 8, 11, 15, 20 and `random`), a 10,000 ms per-solve limit, and `maxOptimalDepth=8`. Machine-dependent times are observations from this run, not performance guarantees. Raw per-scramble records are in [`bench-out/results.csv`](../bench-out/results.csv); aggregates are in [`bench-out/results.json`](../bench-out/results.json). The SVG plots are in [`benchmarks/`](benchmarks/).

## Measured 3×3 examples

| Solver | Scramble depth | Success | Mean solution length | Mean solve time | Mean nodes |
|---|---:|---:|---:|---:|---:|
| Kociemba-style two-phase | 5 | 30/30 | 6.43 | 2.37 ms | 204.30 |
| Kociemba-style two-phase | 8 | 30/30 | 9.83 | 0.87 ms | 139.73 |
| Kociemba-style two-phase | 11 | 30/30 | 20.53 | 179.17 ms | 20,596.43 |
| Kociemba-style two-phase | 15 | 30/30 | 22.83 | 448.03 ms | 42,446.90 |
| Kociemba-style two-phase | 20 | 30/30 | 23.07 | 387.50 ms | 46,259.83 |
| Kociemba-style two-phase | random | 29/30 | 23.10 | 466.00 ms | 39,486.28 |

The depth-5 and depth-8 means are very small because these scrambles often simplify substantially; these values are not evidence that time or node counts must increase monotonically with scramble depth. The random Kociemba sample had one timeout under the configured cap.

## Scope and interpretation

This CLI run covers six registered solver IDs and the requested depth labels; 2×2 solvers only report applicable 2×2 records. The IDA* optimal solver is deliberately capped at depth 8 in this run, so it does not establish optimal performance on the deeper or random 3×3 states. The 2×2 BFS implementations are limited to their supported 2×2 state space. The beginner solver is a hybrid: guided IDA* handles the cross and first layer, while the two-phase engine completes the middle and last layers. Its results must not be described as a fully hand-coded layer-by-layer algorithm.

Times include the costs reported by the solver, and may include table initialization depending on whether that worker had built tables already. The reported peak-memory field is a best-effort per-solve estimate, not a browser process memory measurement. Compare algorithms only alongside the solver scope, supported puzzle, success/timeout rate, and these measurement limits. Reproduce with the command in `PLAN.md` after `npm run build:engine`.
