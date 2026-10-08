/**
 * Interactive 3D Rubik's Cube (three.js).
 *
 * Design: the 26 visible cubies sit at fixed grid positions and are recolored from a logical
 * facelet-state array (the single source of truth, shared with @cubelab/engine). A face turn is
 * animated by temporarily re-parenting the layer's cubies under a pivot and easing a 90° spin;
 * on completion the cubies snap back to their fixed transforms (a 90° turn maps grid positions
 * to grid positions, so this is seamless) and every sticker is recolored from the new state.
 *
 * View rotation (orbit) is drag-on-background; a drag that starts on a sticker turns that face.
 */

import * as THREE from "three";
import {
  Face,
  SOLVED_FACELETS,
  FACELET_MOVE,
  applyFaceletMove,
  cubieToFacelet,
  type CubieCube,
  type FaceletCube,
} from "@cubelab/engine";

const AXIS_NAME = ["x", "y", "z"] as const;
// Per face: normal axis (0/1/2) and outer sign (+1/-1). Order U,R,F,D,L,B.
const FACE_GEO = [
  { axis: 1, sign: +1 }, // U
  { axis: 0, sign: +1 }, // R
  { axis: 2, sign: +1 }, // F
  { axis: 1, sign: -1 }, // D
  { axis: 0, sign: -1 }, // L
  { axis: 2, sign: -1 }, // B
];

/** Replicates engine facelet geometry so sticker (position,normal) ↔ engine facelet index. */
function faceletPosition(face: Face, row: number, col: number): [number, number, number] {
  switch (face) {
    case Face.U: return [col - 1, 1, row - 1];
    case Face.D: return [col - 1, -1, 1 - row];
    case Face.F: return [col - 1, 1 - row, 1];
    case Face.B: return [1 - col, 1 - row, -1];
    case Face.R: return [1, 1 - row, 1 - col];
    case Face.L: return [-1, 1 - row, col - 1];
  }
}

const key = (p: number[], n: number[]) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;

interface Sticker {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  facelet: number; // engine facelet index this sticker always reads
}

export interface CubeViewOptions {
  animMs?: number;
  reducedMotion?: boolean;
}

export class CubeView {
  readonly el: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group(); // orbit container
  private cubies: THREE.Group[] = [];
  private stickers: Sticker[] = [];
  private facelets: FaceletCube = SOLVED_FACELETS.slice();
  private faceColors: THREE.Color[] = [];
  private animating = false;
  private animMs: number;
  reducedMotion: boolean;
  onMove?: (face: Face, power: 1 | 2 | 3) => void;

  constructor(el: HTMLElement, opts: CubeViewOptions = {}) {
    this.el = el;
    this.animMs = opts.animMs ?? 260;
    this.reducedMotion = opts.reducedMotion ?? false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(4.6, 4.2, 5.8);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key1 = new THREE.DirectionalLight(0xffffff, 1.1);
    key1.position.set(6, 10, 8);
    this.scene.add(key1);
    const key2 = new THREE.DirectionalLight(0x9ab6ff, 0.4);
    key2.position.set(-8, -4, -6);
    this.scene.add(key2);

    this.root.rotation.set(-0.12, 0.6, 0);
    this.scene.add(this.root);

    this.readThemeColors();
    this.buildCubies();
    this.recolor();
    this.attachPointer();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.loop();
  }

  /** Read cube face colors from CSS variables (theme + colorblind aware). */
  readThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const names = ["--cube-U", "--cube-R", "--cube-F", "--cube-D", "--cube-L", "--cube-B"];
    this.faceColors = names.map((n) => new THREE.Color(cs.getPropertyValue(n).trim() || "#888"));
    for (const s of this.stickers) s.mat.color.copy(this.faceColors[this.facelets[s.facelet]!]!);
  }

  private buildCubies() {
    // engine facelet lookup
    const faceletByKey = new Map<string, number>();
    for (let f = 0; f < 6; f++) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const i = f * 9 + row * 3 + col;
          const p = faceletPosition(f as Face, row, col);
          const n = [0, 0, 0];
          n[FACE_GEO[f]!.axis] = FACE_GEO[f]!.sign;
          faceletByKey.set(key(p, n), i);
        }
      }
    }

    const cubieGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.55, metalness: 0.1 });
    const stickerGeo = new THREE.PlaneGeometry(0.82, 0.82);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const g = new THREE.Group();
          g.position.set(x, y, z);
          const body = new THREE.Mesh(cubieGeo, bodyMat);
          g.add(body);
          // stickers on outward faces
          const faces: { axis: number; sign: number }[] = [];
          if (x !== 0) faces.push({ axis: 0, sign: x });
          if (y !== 0) faces.push({ axis: 1, sign: y });
          if (z !== 0) faces.push({ axis: 2, sign: z });
          for (const fc of faces) {
            const pos = [x, y, z];
            const nrm = [0, 0, 0];
            nrm[fc.axis] = fc.sign;
            const facelet = faceletByKey.get(key(pos, nrm));
            if (facelet === undefined) continue;
            const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.0 });
            const sticker = new THREE.Mesh(stickerGeo, mat);
            // place on the cube face, slightly proud
            sticker.position.set((nrm[0] ?? 0) * 0.49, (nrm[1] ?? 0) * 0.49, (nrm[2] ?? 0) * 0.49);
            if (fc.axis === 0) sticker.rotation.y = fc.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
            if (fc.axis === 1) sticker.rotation.x = fc.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
            if (fc.axis === 2 && fc.sign < 0) sticker.rotation.y = Math.PI;
            g.add(sticker);
            this.stickers.push({ mesh: sticker, mat, facelet });
          }
          this.cubies.push(g);
          this.root.add(g);
        }
      }
    }
  }

  private recolor() {
    for (const s of this.stickers) s.mat.color.copy(this.faceColors[this.facelets[s.facelet]!]!);
  }

  /** Set the whole cube from an engine cube state (no animation). */
  setCube(cube: CubieCube) {
    this.facelets = cubieToFacelet(cube);
    this.recolor();
  }
  setFacelets(fc: FaceletCube) {
    this.facelets = fc.slice();
    this.recolor();
  }

  get isAnimating() {
    return this.animating;
  }
  setAnimMs(ms: number) {
    this.animMs = ms;
  }

  /** Animate a single face turn and update logical state. Resolves when done. */
  async turn(face: Face, power: 1 | 2 | 3, silent = false): Promise<void> {
    if (this.animating) return;
    const geo = FACE_GEO[face]!;
    const targetFacelets = (() => {
      let fc = this.facelets.slice();
      for (let p = 0; p < power; p++) fc = applyFaceletMove(fc, FACELET_MOVE[face]!);
      return fc;
    })();

    if (!silent) this.onMove?.(face, power);

    const doMs = this.reducedMotion ? 0 : this.animMs;
    const axisName = AXIS_NAME[geo.axis]!;
    // clockwise-from-outside = rotate about +axis by -sign*90° (matches engine)
    const quarter = (-geo.sign * Math.PI) / 2;
    const angle = power === 3 ? -quarter : quarter * power;

    // gather layer cubies
    const pivot = new THREE.Group();
    this.root.add(pivot);
    const layer = this.cubies.filter((c) => Math.round(c.position.getComponent(geo.axis)) === geo.sign);
    for (const c of layer) pivot.add(c);

    this.animating = true;
    await this.tween((t) => {
      pivot.rotation[axisName] = angle * t;
    }, doMs);

    // bake: unparent, restore, recolor
    for (const c of layer) {
      this.root.add(c); // reparent to root (keeps fixed local transform)
    }
    this.root.remove(pivot);
    this.facelets = targetFacelets;
    this.recolor();
    this.animating = false;
  }

  private tween(step: (t: number) => void, ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (ms <= 0) {
        step(1);
        resolve();
        return;
      }
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        step(eased);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  // ---- pointer: orbit the view (drag on background) ----
  private attachPointer() {
    const el = this.renderer.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let facelet: number | undefined;
    let faceDrag = false;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitSticker = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(pointer, this.camera);
      const hit = raycaster.intersectObjects(this.stickers.map((s) => s.mesh), false)[0];
      return hit ? this.stickers.find((s) => s.mesh === hit.object)?.facelet : undefined;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      facelet = hitSticker(e);
      faceDrag = facelet !== undefined;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (faceDrag && facelet !== undefined) {
        if (Math.abs(dx) + Math.abs(dy) > 12) {
          const face = Math.floor(facelet / 9) as Face;
          // Drag direction chooses the quarter turn while the sticker identifies the face.
          const power = (dy > 18 || dx < -18 ? 3 : 1) as 1 | 3;
          faceDrag = false;
          dragging = false;
          this.onMove?.(face, power);
        }
      } else if (!faceDrag) {
        this.root.rotation.y += dx * 0.01;
        this.root.rotation.x += dy * 0.01;
        this.root.rotation.x = Math.max(-1.3, Math.min(1.3, this.root.rotation.x));
      }
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    const size = Math.max(1, Math.min(r.width, r.height));
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };

  dispose() {
    this.renderer.dispose();
  }
}
