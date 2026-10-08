/**
 * Tiny dependency-free SVG chart generator for the benchmark docs. Produces theme-friendly
 * charts (dark background, legible labels) without pulling in a plotting library on the server.
 */

const COLORS = ["#6ea8fe", "#63e6be", "#ffd43b", "#ff8787", "#b197fc", "#ffa94d"];
const BG = "#0e1116";
const FG = "#c9d1d9";
const GRID = "#2d333b";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface Series {
  name: string;
  values: number[]; // one per category
}

/** Grouped bar chart. `categories` on the x-axis, one bar group per category, one bar per series. */
export function groupedBarChart(opts: {
  title: string;
  categories: string[];
  series: Series[];
  yLabel: string;
  width?: number;
  height?: number;
  logScale?: boolean;
}): string {
  const W = opts.width ?? 760;
  const H = opts.height ?? 420;
  const padL = 64;
  const padR = 16;
  const padT = 48;
  const padB = 70;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = opts.series.flatMap((s) => s.values).filter((v) => Number.isFinite(v) && v > 0);
  const rawMax = Math.max(1, ...opts.series.flatMap((s) => s.values).filter(Number.isFinite));
  const useLog = opts.logScale && allVals.length > 0;
  const yMax = useLog ? Math.pow(10, Math.ceil(Math.log10(rawMax))) : niceCeil(rawMax);
  const yMin = useLog ? Math.pow(10, Math.floor(Math.log10(Math.min(...allVals)))) : 0;

  const scaleY = (v: number): number => {
    if (useLog) {
      const lv = Math.log10(Math.max(v, yMin));
      return plotH - ((lv - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * plotH;
    }
    return plotH - (v / yMax) * plotH;
  };

  const nCat = opts.categories.length;
  const nSer = opts.series.length;
  const groupW = plotW / nCat;
  const barW = (groupW * 0.8) / nSer;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, sans-serif">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}" rx="8"/>`);
  parts.push(`<text x="${padL}" y="26" fill="${FG}" font-size="16" font-weight="600">${esc(opts.title)}</text>`);
  parts.push(`<text x="16" y="${padT + plotH / 2}" fill="${FG}" font-size="11" transform="rotate(-90 16 ${padT + plotH / 2})" text-anchor="middle">${esc(opts.yLabel)}</text>`);

  // y gridlines
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const frac = i / ticks;
    const y = padT + plotH - frac * plotH;
    const val = useLog
      ? Math.pow(10, Math.log10(yMin) + frac * (Math.log10(yMax) - Math.log10(yMin)))
      : frac * yMax;
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(`<text x="${padL - 6}" y="${y + 3}" fill="${FG}" font-size="10" text-anchor="end">${fmt(val)}</text>`);
  }

  // bars
  opts.categories.forEach((cat, ci) => {
    const gx = padL + ci * groupW + groupW * 0.1;
    opts.series.forEach((s, si) => {
      const v = s.values[ci];
      if (v == null || !Number.isFinite(v) || v <= 0) return;
      const y = padT + scaleY(v);
      const h = padT + plotH - y;
      const x = gx + si * barW;
      parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.9).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${COLORS[si % COLORS.length]}" rx="2"><title>${esc(s.name)} @ ${esc(cat)}: ${fmt(v)}</title></rect>`);
    });
    parts.push(`<text x="${(padL + ci * groupW + groupW / 2).toFixed(1)}" y="${padT + plotH + 16}" fill="${FG}" font-size="11" text-anchor="middle">${esc(cat)}</text>`);
  });

  // legend
  opts.series.forEach((s, si) => {
    const lx = padL + si * 150;
    const ly = H - 20;
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="11" height="11" fill="${COLORS[si % COLORS.length]}" rx="2"/>`);
    parts.push(`<text x="${lx + 16}" y="${ly}" fill="${FG}" font-size="11">${esc(s.name)}</text>`);
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}

/** Scatter plot (e.g. solution length vs solve time). */
export function scatterChart(opts: {
  title: string;
  points: { x: number; y: number; group: string }[];
  xLabel: string;
  yLabel: string;
  width?: number;
  height?: number;
}): string {
  const W = opts.width ?? 760;
  const H = opts.height ?? 420;
  const padL = 64;
  const padR = 16;
  const padT = 48;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xMax = niceCeil(Math.max(1, ...opts.points.map((p) => p.x)));
  const yMax = niceCeil(Math.max(1, ...opts.points.map((p) => p.y)));
  const groups = [...new Set(opts.points.map((p) => p.group))];

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, sans-serif">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}" rx="8"/>`);
  parts.push(`<text x="${padL}" y="26" fill="${FG}" font-size="16" font-weight="600">${esc(opts.title)}</text>`);
  parts.push(`<text x="16" y="${padT + plotH / 2}" fill="${FG}" font-size="11" transform="rotate(-90 16 ${padT + plotH / 2})" text-anchor="middle">${esc(opts.yLabel)}</text>`);
  parts.push(`<text x="${padL + plotW / 2}" y="${H - 8}" fill="${FG}" font-size="11" text-anchor="middle">${esc(opts.xLabel)}</text>`);

  for (let i = 0; i <= 5; i++) {
    const y = padT + plotH - (i / 5) * plotH;
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${GRID}"/>`);
    parts.push(`<text x="${padL - 6}" y="${y + 3}" fill="${FG}" font-size="10" text-anchor="end">${fmt((i / 5) * yMax)}</text>`);
    const x = padL + (i / 5) * plotW;
    parts.push(`<text x="${x}" y="${padT + plotH + 16}" fill="${FG}" font-size="10" text-anchor="middle">${fmt((i / 5) * xMax)}</text>`);
  }

  for (const p of opts.points) {
    const gi = groups.indexOf(p.group);
    const cx = padL + (p.x / xMax) * plotW;
    const cy = padT + plotH - (p.y / yMax) * plotH;
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="${COLORS[gi % COLORS.length]}" fill-opacity="0.75"><title>${esc(p.group)}: (${fmt(p.x)}, ${fmt(p.y)})</title></circle>`);
  }

  groups.forEach((g, gi) => {
    const lx = padL + gi * 150;
    const ly = padT - 14;
    parts.push(`<circle cx="${lx + 5}" cy="${ly - 3}" r="5" fill="${COLORS[gi % COLORS.length]}"/>`);
    parts.push(`<text x="${lx + 16}" y="${ly}" fill="${FG}" font-size="11">${esc(g)}</text>`);
  });

  parts.push(`</svg>`);
  return parts.join("\n");
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (v >= 10) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(2);
}
