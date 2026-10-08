import { defineConfig } from "vite";

// Relative base so the build works both locally and on GitHub Pages (project site).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
});
