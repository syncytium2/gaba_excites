/**
 * Zoom-time refinement for voltage clamp, the arithmetic kept apart from the plot so it can be tested: when to
 * re-simulate a zoomed span at a finer step, and how to splice that span into the standard traces so the plot
 * still covers the whole sweep (a double-click reset then shows everything).
 */
import type { VCSweep, VCWindowSweep } from "../core/vclamp.ts";

/** zoomed to this span or narrower, ms, the view is re-simulated at the fine step */
export const REFINE_SPAN_MS = 2;
/** the fine step, ms */
export const FINE_DT = 0.001;
/** the view must be still this long before a refinement starts, ms */
export const REFINE_DELAY_MS = 300;

export interface Refined {
  t0: number;
  t1: number;
  fineDt: number;
  sweeps: VCWindowSweep[];
}

export type RefinePlan = { action: "keep" } | { action: "drop" } | { action: "run"; t0: number; t1: number };

/**
 * What a view [x0, x1] of sweeps lasting `total` ms calls for, given what is refined now: keep it (the view lies
 * inside it), drop it (zoomed out past the span, or outside it), or run a new window: the view plus a quarter of
 * its span on each side, within the sweep.
 */
export function planRefine(x0: number, x1: number, total: number, now: { t0: number; t1: number } | null): RefinePlan {
  const span = x1 - x0;
  if (!(span > 0) || span > REFINE_SPAN_MS || span >= total) return now ? { action: "drop" } : { action: "keep" };
  if (now && x0 >= now.t0 - 1e-9 && x1 <= now.t1 + 1e-9) return { action: "keep" };
  const m = span / 4;
  return { action: "run", t0: Math.max(0, x0 - m), t1: Math.min(total, x1 + m) };
}

type Col = (number | null)[];

/**
 * The traces on one time axis: the standard samples outside the refined window, every fine sample inside it.
 * Each column is a sweep (null past its end). `blankMs`, when blanking is on, holds the recorded current over
 * that long after each step inside the window too, as the standard traces are blanked.
 */
export function spliceWindow(sweeps: VCSweep[], win: Refined | null, blankMs: number | null): { t: Float64Array; iRec: Col[]; iTrue: Col[]; vm: Col[]; vCmd: Col[] } {
  const dt = sweeps[0].sampleMs;
  const n = Math.max(...sweeps.map((s) => s.iRec.length));
  const fine = win && win.sweeps.length === sweeps.length ? win : null;
  // the standard indices before and after the window, and the window's fine samples
  const a = fine ? Math.max(0, Math.min(n, Math.round(fine.sweeps[0].t0 / dt))) : n;
  const m = fine ? Math.max(...fine.sweeps.map((w) => w.iRec.length)) : 0;
  const tEnd = fine ? fine.sweeps[0].t0 + (m - 1) * fine.fineDt : -Infinity;
  const b = fine ? Math.min(n, Math.floor(tEnd / dt + 1e-9) + 1) : n;
  const len = a + m + (n - b);
  const t = new Float64Array(len);
  for (let j = 0; j < a; j++) t[j] = j * dt;
  for (let j = 0; j < m; j++) t[a + j] = fine!.sweeps[0].t0 + j * fine!.fineDt;
  for (let j = b; j < n; j++) t[a + m + (j - b)] = j * dt;
  const col = (std: Float32Array, w: Float32Array | undefined): Col => {
    const out: Col = new Array(len).fill(null);
    for (let j = 0; j < Math.min(a, std.length); j++) out[j] = std[j];
    if (w) for (let j = 0; j < w.length; j++) out[a + j] = w[j];
    for (let j = b; j < Math.min(n, std.length); j++) out[a + m + (j - b)] = std[j];
    return out;
  };
  const iRec = sweeps.map((s, k) => col(s.iRec, fine?.sweeps[k].iRec));
  if (fine && blankMs !== null && blankMs > 0) {
    // inside the window, hold the recorded current from just before each step, as blankSweep does outside it
    const w0 = t[a];
    const w1 = m ? t[a + m - 1] : w0;
    sweeps.forEach((s, k) => {
      for (const ts of s.starts) {
        if (ts <= 0 || ts + blankMs < w0 || ts > w1) continue;
        let j = a;
        while (j < a + m && t[j] < ts - 1e-9) j++;
        const held = j > 0 ? iRec[k][j - 1] : iRec[k][j];
        for (; j < a + m && t[j] <= ts + blankMs + 1e-9; j++) iRec[k][j] = held;
      }
    });
  }
  return {
    t,
    iRec,
    iTrue: sweeps.map((s, k) => col(s.iTrue, fine?.sweeps[k].iTrue)),
    vm: sweeps.map((s, k) => col(s.vm, fine?.sweeps[k].vm)),
    vCmd: sweeps.map((s, k) => col(s.vCmd, fine?.sweeps[k].vCmd)),
  };
}
