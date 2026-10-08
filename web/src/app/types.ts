import type { CubieCube } from "@cubelab/engine";

export interface View {
  id: string;
  label: string;
  el: HTMLElement;
  onShow?(): void;
  onHide?(): void;
}

export interface AppContext {
  /** The current working cube (shared across views, e.g. painter → solver). */
  getCube(): CubieCube;
  setCube(cube: CubieCube, label?: string): void;
  reducedMotion: boolean;
  /** Switch to another view by id. */
  go(viewId: string): void;
}
