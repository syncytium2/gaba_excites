/**
 * Small, dependency-free SVG line and dot plots, for the downloadable report.
 *
 * The report is one self-contained HTML file a student hands in, so its figures
 * are inline SVG strings: no canvas, no library, nothing fetched. Pure string
 * building, so it runs in the worker, in node and in vitest alike.
 */

export interface Series {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string;
  label?: string;
  dash?: string;
  width?: number;
  /** draw markers instead of (or as well as) a line */
  dots?: boolean;
  line?: boolean;
}

export interface PlotSpec {
  series: Series[];
  xlabel: string;
  ylabel: string;
  width?: number;
  height?: number;
  xrange?: [number, number];
  yrange?: [number, number];
  /** horizontal reference lines */
  hlines?: { y: number; color: string; label?: string }[];
  /** labeled points, e.g. thresholds */
  marks?: { x: number; y: number; color: string; shape?: "circle" | "diamond" }[];
  title?: string;
  legend?: boolean;
}

const INK2 = "#52514e";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Nice" tick values covering [lo, hi], about n of them. */
export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function extent(series: Series[], key: "x" | "y"): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series)
    for (let i = 0; i < s[key].length; i++) {
      const v = s[key][i];
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
}

const fmtTick = (v: number) => (Math.abs(v) >= 1000 || Number.isInteger(v) ? String(Math.round(v)) : String(+v.toPrecision(3)));

export function linePlot(p: PlotSpec): string {
  const W = p.width ?? 560;
  const H = p.height ?? 260;
  const M = { l: 56, r: 12, t: p.title ? 26 : 10, b: 40 };
  const [x0, x1] = p.xrange ?? extent(p.series, "x");
  let [y0, y1] = p.yrange ?? extent(p.series, "y");
  if (!p.yrange) {
    const pad = 0.05 * (y1 - y0);
    y0 -= pad;
    y1 += pad;
  }
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(p.title ?? p.ylabel)}" style="max-width:${W}px;font:11px system-ui,-apple-system,sans-serif">`);
  if (p.title) parts.push(`<text x="${M.l}" y="16" font-size="12.5" fill="#0b0b0b">${esc(p.title)}</text>`);
  for (const t of niceTicks(x0, x1)) {
    const X = sx(t).toFixed(1);
    parts.push(`<line x1="${X}" x2="${X}" y1="${M.t}" y2="${H - M.b}" stroke="${GRID}"/>`);
    parts.push(`<text x="${X}" y="${H - M.b + 14}" text-anchor="middle" fill="${INK2}">${fmtTick(t)}</text>`);
  }
  for (const t of niceTicks(y0, y1)) {
    const Y = sy(t).toFixed(1);
    parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${Y}" y2="${Y}" stroke="${GRID}"/>`);
    parts.push(`<text x="${M.l - 6}" y="${(+Y + 4).toFixed(1)}" text-anchor="end" fill="${INK2}">${fmtTick(t)}</text>`);
  }
  parts.push(`<rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="none" stroke="${AXIS}"/>`);
  parts.push(`<text x="${(M.l + W - M.r) / 2}" y="${H - 6}" text-anchor="middle" fill="${INK2}">${esc(p.xlabel)}</text>`);
  parts.push(`<text transform="translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle" fill="${INK2}">${esc(p.ylabel)}</text>`);
  parts.push(`<clipPath id="c${W}${H}"><rect x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/></clipPath><g clip-path="url(#c${W}${H})">`);
  for (const h of p.hlines ?? []) {
    const Y = sy(h.y).toFixed(1);
    parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${Y}" y2="${Y}" stroke="${h.color}" stroke-dasharray="4 3"/>`);
    if (h.label) parts.push(`<text x="${W - M.r - 4}" y="${(+Y - 4).toFixed(1)}" text-anchor="end" fill="${h.color}">${esc(h.label)}</text>`);
  }
  for (const s of p.series) {
    if (s.line !== false) {
      let d = "";
      let pen = false;
      for (let i = 0; i < s.x.length; i++) {
        const xv = s.x[i];
        const yv = s.y[i];
        if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${sx(xv).toFixed(1)} ${sy(yv).toFixed(1)}`;
        pen = true;
      }
      if (d) parts.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 1.6}" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`);
    }
    if (s.dots)
      for (let i = 0; i < s.x.length; i++)
        if (Number.isFinite(s.x[i]) && Number.isFinite(s.y[i]))
          parts.push(`<circle cx="${sx(s.x[i]).toFixed(1)}" cy="${sy(s.y[i]).toFixed(1)}" r="4" fill="${s.color}" stroke="#fcfcfb" stroke-width="1.5"/>`);
  }
  for (const m of p.marks ?? []) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    const X = sx(m.x);
    const Y = sy(m.y);
    parts.push(
      m.shape === "diamond"
        ? `<path d="M${X.toFixed(1)} ${(Y - 5).toFixed(1)}l5 5l-5 5l-5 -5z" fill="${m.color}" stroke="#fcfcfb" stroke-width="1.2"/>`
        : `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="4.5" fill="${m.color}" stroke="#fcfcfb" stroke-width="1.5"/>`,
    );
  }
  parts.push("</g>");
  if (p.legend) {
    const items = p.series.filter((s) => s.label);
    items.forEach((s, i) => {
      const Y = M.t + 12 + i * 15;
      parts.push(`<line x1="${M.l + 8}" x2="${M.l + 26}" y1="${Y - 4}" y2="${Y - 4}" stroke="${s.color}" stroke-width="2"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`);
      parts.push(`<text x="${M.l + 31}" y="${Y}" fill="#0b0b0b">${esc(s.label!)}</text>`);
    });
  }
  parts.push("</svg>");
  return parts.join("");
}
