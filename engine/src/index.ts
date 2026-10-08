/**
 * @cubelab/engine — public API surface.
 *
 * The engine is implemented in TypeScript behind a language-agnostic `Solver`
 * interface so a later C++17/WASM port (via Emscripten) can plug in without the
 * web app changing. See docs/RESEARCH.md and README → Limitations for why TS is
 * the first implementation in this environment.
 *
 * Modules are added phase by phase; this barrel re-exports them as they land.
 */

export const ENGINE_VERSION = "0.1.0";
