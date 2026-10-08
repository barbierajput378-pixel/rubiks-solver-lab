import { Face, FACE_NAMES, SOLVED_FACELETS, validateFacelets } from "@cubelab/engine";
import type { FaceletCube } from "@cubelab/engine";
import { h, toast } from "../ui/dom";

interface RGB { r: number; g: number; b: number }
const palette: RGB[] = [
  { r: 248, g: 248, b: 248 }, { r: 200, g: 16, b: 46 }, { r: 0, g: 155, b: 72 },
  { r: 255, g: 213, b: 0 }, { r: 255, g: 88, b: 0 }, { r: 0, g: 70, b: 173 },
];

function rgbLab(c: RGB): [number, number, number] {
  const linear = [c.r, c.g, c.b].map((x) => { x /= 255; return x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92; });
  const x = (linear[0]! * 0.4124 + linear[1]! * 0.3576 + linear[2]! * 0.1805) / 0.95047;
  const y = (linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722);
  const z = (linear[0]! * 0.0193 + linear[1]! * 0.1192 + linear[2]! * 0.9505) / 1.08883;
  const f = (v: number) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dist = (a: RGB, b: RGB) => { const x = rgbLab(a), y = rgbLab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
export function classifyRgb(color: RGB, references: Array<RGB | undefined>): { face: number; confidence: number } {
  let best = 0, bestD = Infinity, second = Infinity, available = 0;
  for (let k = 0; k < references.length; k++) if (references[k]) {
    available++;
    const d = dist(color, references[k]!);
    if (d < bestD) { second = bestD; bestD = d; best = k; } else if (d < second) second = d;
  }
  return { face: best, confidence: available < 6 ? 0 : Math.max(0, Math.min(1, (second - bestD) / 28)) };
}

export function buildScanner(onValidCube: (cube: ReturnType<typeof validateFacelets>["cube"]) => void): HTMLElement {
  const section = h("section", { class: "card scanner" });
  section.append(h("h2", {}, ["Self-calibrating camera scanner"]), h("p", { class: "subtle" }, ["Point one cube face squarely at the guide. Capture all six faces; each face center calibrates its color under the current lighting. You can also upload a photo or correct any sticker by tapping it."]));
  const row = h("div", { class: "row" });
  const video = h("video", { autoplay: true, playsinline: true, muted: true, "aria-label": "Camera preview" }) as HTMLVideoElement;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const cameraStatus = h("p", { class: "subtle", role: "status" }, ["Camera is off; photo upload and manual correction remain available."]);
  let stream: MediaStream | undefined;
  let photo: HTMLImageElement | undefined;
  let captured = new Set<number>();
  let centers: Array<RGB | undefined> = new Array(6);
  const facelets: FaceletCube = SOLVED_FACELETS.slice();
  const confidence = new Array<number>(54).fill(0);
  const raw = new Array<RGB | undefined>(54);
  const faceSelect = h("select", { "aria-label": "Face being scanned" });
  for (let f = 0; f < 6; f++) faceSelect.append(h("option", { value: String(f) }, [`${FACE_NAMES[f]} face` ]));
  const net = h("div", { class: "scan-net", "aria-label": "Captured face stickers" });
  const stickers: HTMLButtonElement[] = [];
  for (let f = 0; f < 6; f++) {
    const face = h("div", { class: "paint-face", "aria-label": `${FACE_NAMES[f]} stickers` });
    for (let i = 0; i < 9; i++) {
      const at = f * 9 + i;
      const tile = h("button", { class: "paint-tile scan-tile", "aria-label": `${FACE_NAMES[f]} sticker ${i + 1}, confidence not measured` }) as HTMLButtonElement;
      tile.style.background = `var(--cube-${FACE_NAMES[facelets[at]!]})`;
      tile.onclick = () => { facelets[at] = ((facelets[at]! + 1) % 6) as Face; updateTile(at); updateValidation(); };
      stickers[at] = tile; face.append(tile);
    }
    net.append(face);
  }
  const validity = h("p", { class: "subtle", role: "status" }, ["Capture all six faces or correct stickers manually."]);
  const updateTile = (at: number) => { stickers[at]!.style.background = `var(--cube-${FACE_NAMES[facelets[at]!]})`; stickers[at]!.setAttribute("aria-label", `${FACE_NAMES[Math.floor(at / 9)]} sticker ${(at % 9) + 1}, ${FACE_NAMES[facelets[at]!]}; confidence ${confidence[at] ? Math.round(confidence[at]! * 100) + "%" : "manual"}`); };
  const updateValidation = () => { const v = validateFacelets(facelets); validity.textContent = v.ok ? "✓ Sticker counts and cube reachability are valid." : `${captured.size}/6 faces captured. ${v.message}`; validity.className = `subtle ${v.ok ? "valid" : "invalid"}`; };

  const sample = (source: CanvasImageSource, width: number, height: number) => {
    const size = Math.min(width, height) * 0.72;
    const x0 = (width - size) / 2, y0 = (height - size) / 2;
    canvas.width = Math.max(1, Math.floor(size)); canvas.height = Math.max(1, Math.floor(size));
    context.drawImage(source, x0, y0, size, size, 0, 0, canvas.width, canvas.height);
    const centerColor = readPatch(1, 1);
    const f = Number(faceSelect.value);
    centers[f] = centerColor; facelets[f * 9 + 4] = f as Face; captured.add(f);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) raw[f * 9 + r * 3 + c] = readPatch(c, r);
    // Reclassify every captured face when a new center calibration arrives. This avoids
    // guessing the first face's colors before all six lighting references are known.
    for (const faceIndex of captured) for (let i = 0; i < 9; i++) {
      const at = faceIndex * 9 + i;
      if (i === 4) { facelets[at] = faceIndex as Face; confidence[at] = 1; updateTile(at); continue; }
      const color = raw[at]!;
      const classified = classifyRgb(color, centers);
      facelets[at] = classified.face as Face;
      confidence[at] = classified.confidence;
      updateTile(at);
    }
    updateValidation();
  };
  function readPatch(col: number, row: number): RGB {
    const px = Math.floor((col + 0.5) * canvas.width / 3), py = Math.floor((row + 0.5) * canvas.height / 3);
    const im = context.getImageData(Math.max(0, px - 2), Math.max(0, py - 2), Math.min(5, canvas.width - Math.max(0, px - 2)), Math.min(5, canvas.height - Math.max(0, py - 2)));
    let r = 0, g = 0, b = 0; const n = im.data.length / 4;
    for (let i = 0; i < im.data.length; i += 4) { r += im.data[i]!; g += im.data[i + 1]!; b += im.data[i + 2]!; }
    return { r: r / n, g: g / n, b: b / n };
  }
  const capture = () => {
    if (photo) sample(photo, photo.naturalWidth, photo.naturalHeight);
    else if (video.videoWidth) sample(video, video.videoWidth, video.videoHeight);
    else toast("Start the camera or choose a photo first.");
  };
  const start = h("button", { class: "btn", type: "button" }, ["Start camera"]);
  start.onclick = async () => { try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); video.srcObject = stream; cameraStatus.textContent = "Camera ready. Center one face in the square guide."; } catch (e) { cameraStatus.textContent = `Camera unavailable: ${(e as Error).message}. Upload a photo or use manual stickers.`; } };
  const upload = h("input", { type: "file", accept: "image/*", "aria-label": "Upload cube photo" }) as HTMLInputElement;
  upload.onchange = () => { const file = upload.files?.[0]; if (!file) return; const url = URL.createObjectURL(file); photo = new Image(); photo.onload = () => { cameraStatus.textContent = `Photo loaded: ${file.name}. Select its face and capture.`; }; photo.onerror = () => { cameraStatus.textContent = "That image could not be read."; }; photo.src = url; };
  row.append(start, faceSelect, h("button", { class: "btn primary", type: "button", onclick: capture }, ["Capture face"]), upload);
  const preview = h("div", { class: "scanner-preview" }, [video, h("div", { class: "scanner-guide", "aria-hidden": "true" })]);
  const use = h("button", { class: "btn primary", type: "button" }, ["Use scanned cube"]);
  use.onclick = () => { const v = validateFacelets(facelets); updateValidation(); if (v.ok && v.cube) { onValidCube(v.cube); toast("Scanned cube loaded"); } else toast("Fix the stickers until the cube is valid"); };
  section.append(row, preview, cameraStatus, net, validity, h("p", { class: "subtle" }, ["Tap a sticker to cycle a one-tap correction. Confidence appears in each sticker's accessible label."]), h("div", { class: "row" }, [use, h("button", { class: "btn", type: "button", onclick: () => { for (let i = 0; i < 54; i++) { facelets[i] = SOLVED_FACELETS[i]!; confidence[i] = 0; updateTile(i); } captured.clear(); centers = new Array(6); updateValidation(); } }, ["Reset scanner"])]));
  const observer = new MutationObserver(() => { if (!section.isConnected) { stream?.getTracks().forEach((t) => t.stop()); observer.disconnect(); } });
  observer.observe(document.body, { childList: true, subtree: true });
  return section;
}
