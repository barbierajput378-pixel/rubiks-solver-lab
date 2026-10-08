import { describe, expect, it } from "vitest";
import { classifyRgb } from "./scanner";

const references = [
  { r: 245, g: 245, b: 245 }, { r: 195, g: 24, b: 45 }, { r: 12, g: 145, b: 65 },
  { r: 240, g: 202, b: 15 }, { r: 236, g: 81, b: 12 }, { r: 12, g: 69, b: 160 },
];
const shade = (n: number) => references.map((c) => ({ r: c.r * n, g: c.g * n, b: c.b * n }));
const warm = (n: number) => references.map((c) => ({ r: Math.min(255, c.r * n * 1.08), g: c.g * n, b: c.b * n * 0.88 }));

describe("camera sticker classification", () => {
  it("calibrates labels from center stickers under dim and warm lighting", () => {
    for (const refs of [shade(0.55), shade(0.78), warm(0.76), references]) {
      for (let face = 0; face < refs.length; face++) {
        const result = classifyRgb(refs[face]!, refs);
        expect(result.face).toBe(face);
        expect(result.confidence).toBeGreaterThan(0);
      }
    }
  });

  it("does not report confidence until all six center references are available", () => {
    const partial = classifyRgb(references[2]!, references.map((x, i) => i < 2 ? x : undefined));
    expect(partial.confidence).toBe(0);
  });
});
