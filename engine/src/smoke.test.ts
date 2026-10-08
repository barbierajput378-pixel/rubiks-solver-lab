import { describe, it, expect } from "vitest";
import { ENGINE_VERSION } from "./index.js";

describe("engine scaffold", () => {
  it("exposes a version", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
