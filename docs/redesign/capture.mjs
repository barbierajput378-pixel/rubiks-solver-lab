// Repeatable screenshot capture for the CubeLab redesign visual-QA loop.
// Launches Chromium with SwiftShader so the three.js WebGL canvas renders in
// headless WSL. Usage:
//   node docs/redesign/capture.mjs <outDir> [theme] [views...]
//   node docs/redesign/capture.mjs before            # all views, dark
//   node docs/redesign/capture.mjs after light solve # one view, light theme
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outName = process.argv[2] ?? "before";
const theme = process.argv[3] ?? "dark";
const BASE = "http://localhost:5173/";
const OUT = resolve(__dirname, outName);

const ALL_VIEWS = [
  "solve", "race", "explorer", "lab", "doctor", "learn", "scanner", "bench",
];
const viewArg = process.argv.slice(4);
const views = viewArg.length ? viewArg : ALL_VIEWS;

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

async function shoot(ctx, url, file, { onboard }) {
  const page = await ctx.newPage();
  await page.addInitScript(
    ([t, ob]) => {
      try {
        localStorage.setItem("cubelab-theme", t);
        if (ob) localStorage.setItem("cubelab-onboarded", "yes");
        else localStorage.removeItem("cubelab-onboarded");
      } catch {}
    },
    [theme, onboard],
  );
  // `domcontentloaded` (not networkidle/load) — the Vite dev server keeps an HMR
  // socket open and lazy chunks can keep `load` pending.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Give three.js a moment to build + render the first frames.
  await page.waitForTimeout(1800);
  await page.screenshot({ path: file, animations: "disabled" });
  await page.close();
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    colorScheme: theme === "light" ? "light" : "dark",
  });
  // Onboarding overlay: captured once on the solve view with a fresh profile.
  if (views.includes("solve")) {
    await shoot(ctx, `${BASE}?view=solve`, `${OUT}/onboarding-${vp.tag}.png`, {
      onboard: false,
    });
  }
  for (const v of views) {
    await shoot(ctx, `${BASE}?view=${v}`, `${OUT}/${v}-${vp.tag}.png`, {
      onboard: true,
    });
  }
  await ctx.close();
  console.log(`captured ${views.length + (views.includes("solve") ? 1 : 0)} shots @ ${vp.tag}`);
}

await browser.close();
console.log(`done -> ${OUT}`);
