/**
 * Running the mouse beta cell (beta.ts) for the tests and the CLI: no
 * electrode, no input, from a given start, with the measurements the
 * paper's figures are checked by. Kept apart from beta.ts because it needs
 * the cell and the solver, which import the model registry, which imports
 * beta.ts.
 */
import { buildCell } from "./cell.ts";
import { step } from "./simulate.ts";
import { BETA_CM, betaMouse, DOM_SETS, type DomSet } from "./beta.ts";

function buildCellFor(set: DomSet) {
  return buildCell({ model: "betamouse", cm: BETA_CM, gLeak: 0 }, betaMouse(set));
}

/** Times (in samples) of local maxima above `floor`. */
export function peaks(x: number[], floor: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < x.length - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > floor) out.push(i);
  return out;
}

/** Mean spacing of a sorted list. */
export function meanDiff(t: number[]): number {
  return (t[t.length - 1] - t[0]) / (t.length - 1);
}

/** [V, n, Ca, ADP, Ca_er, G6P, FBP], the authors' figure files' starting values. */
export const DOM_START: Record<keyof typeof DOM_SETS, number[]> = {
  fast: [-60, 0.00016, 0.08, 789, 170, 187, 16], // Fig3.ode
  compound: [-61, 0.0001, 0.07, 804, 144, 196, 0.0076], // Fig5.ode
  accordion: [-61, 0.0001, 0.085, 840, 197, 219, 0.015], // Fig6.ode
  glycolytic: [-61, 0.0001, 0.07, 804, 144, 196, 0.0076], // Fig7.ode
  subthreshold: [-65, 0.00005, 0.047, 757, 95, 207, 0.0073], // Fig8.ode
};

export interface DomRun {
  spikes: number;
  /** burst onsets, s: a spike after at least 3 s without one */
  bursts: number[];
  /** FBP maxima, min */
  fbpPeaks: number[];
  vMin: number;
  vMax: number;
  /** one sample per second after the first two minutes */
  ca: number[];
  adp: number[];
  fbp: number[];
}

/**
 * Run the beta cell with no electrode and no input from a given start, and
 * measure what the tests and the CLI ask of it: spikes (upward through
 * −30 mV), burst onsets (a spike after 3 s without one), FBP maxima, and one
 * sample per second of Ca, ADP and FBP after the first two minutes.
 */
export function runDom(set: DomSet, start: number[], minutes: number, dt: number): DomRun {
  const cell = buildCellFor(set);
  const [kdr, cav, , katp] = cell.offsets;
  const s = new Float64Array(cell.nState);
  const [v, n, ca, adp, caer, g6p, fbp] = start;
  s[cell.iv] = v;
  s[cell.ip] = v;
  s[kdr] = n;
  s[cav] = 1 / (1 + Math.exp(-(20 + v) / 12));
  s[cell.iCa] = ca;
  s[cell.ix] = caer;
  s[katp] = adp;
  s[katp + 1] = g6p;
  s[katp + 2] = fbp;
  const e = { rs: 0, cp: 0, bridge: 1 };
  const syn = { gGlu: 0, gGaba: 0, eGlu: 0, eGaba: 0 };
  const out: DomRun = { spikes: 0, bursts: [], fbpPeaks: [], vMin: Infinity, vMax: -Infinity, ca: [], adp: [], fbp: [] };
  const nSteps = Math.round((minutes * 60000) / dt);
  const perSecond = Math.round(1000 / dt);
  let up = false;
  let last = -Infinity;
  const fbpAll: number[] = [];
  for (let i = 1; i <= nSteps; i++) {
    step(cell, e, s, 0, 0, dt, syn);
    const t = i * dt;
    const vm = s[cell.iv];
    if (!up && vm > -30) {
      up = true;
      out.spikes++;
      if (t - last > 3000) out.bursts.push(t / 1000);
      last = t;
    } else if (up && vm < -40) up = false;
    else if (vm > -30) last = t;
    if (t > 120000) {
      out.vMin = Math.min(out.vMin, vm);
      out.vMax = Math.max(out.vMax, vm);
    }
    if (i % perSecond === 0) {
      fbpAll.push(s[katp + 2]);
      if (t > 120000) {
        out.ca.push(s[cell.iCa]);
        out.adp.push(s[katp]);
        out.fbp.push(s[katp + 2]);
      }
    }
  }
  out.fbpPeaks = peaks(fbpAll, 1).map((i) => (i + 1) / 60);
  return out;
}

/** Pearson correlation. */
export function corr(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

