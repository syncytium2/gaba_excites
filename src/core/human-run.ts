/**
 * Running the human beta cell (human.ts) for the tests and the CLI: no electrode, no input, from the authors'
 * starting values, with the measurements the papers' results are checked by. Kept apart from human.ts because
 * it needs the cell and the solver, which import the model registry, which imports human.ts.
 */
import { buildCell } from "./cell.ts";
import { step, type SynNow } from "./simulate.ts";
import { HUMAN_CM, RIZ_2014, humanBeta, type HumanParams } from "./human.ts";

const NO_SYN: SynNow = { gGlu: 0, gGaba: 0, eGlu: 0, eGaba: 0 };
const IDEAL = { rs: 0, cp: 0, bridge: 1 };

export interface HumanRun {
  /** upward crossings of −30 mV, ms, interpolated */
  spikes: number[];
  /** over the time after `skipMs` */
  vMin: number;
  vMax: number;
  /** mean interspike interval after `skipMs`, ms (NaN with fewer than two spikes) */
  isi: number;
  /** spikes per second after `skipMs` (0 with fewer than two spikes) */
  rate: number;
  /** the state at the end: [V, Ca_m, Ca_c] */
  end: number[];
}

/**
 * Run the cell with parameters `over` (the papers' densities) for `ms`, from the authors' starting values
 * (PLoSCompBiol_Fig1.ode), or from `from` (a state from an earlier run), at time step `dt`. `change` swaps
 * parameters partway, at `change.atMs`, keeping the state: an application of a drug or of GABA.
 */
export function runHuman(
  over: Partial<HumanParams>,
  ms: number,
  dt: number,
  opt: { skipMs?: number; change?: { atMs: number; over: Partial<HumanParams> } } = {},
): HumanRun {
  const p = { ...RIZ_2014, ...over };
  const make = (q: HumanParams) => buildCell({ model: "betahuman", cm: HUMAN_CM, gLeak: q.gLeak * HUMAN_CM }, humanBeta(q));
  let cell = make(p);
  const s = new Float64Array(cell.nState);
  const st = cell.model.start!;
  for (let k = 0; k < cell.channels.length; k++) {
    const g = st.gates?.[cell.channels[k].id];
    if (g) g.forEach((x, j) => (s[cell.offsets[k] + j] = x));
  }
  s[cell.iv] = st.v;
  s[cell.ip] = st.v;
  s[cell.iCa] = st.ca;
  st.extra?.forEach((x, j) => (s[cell.ix + j] = x));

  const skip = opt.skipMs ?? 0;
  const n = Math.round(ms / dt);
  const spikes: number[] = [];
  let vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (opt.change && i === Math.round(opt.change.atMs / dt)) cell = make({ ...p, ...opt.change.over });
    const v0 = s[cell.iv];
    step(cell, IDEAL, s, 0, 0, dt, NO_SYN);
    const v1 = s[cell.iv];
    const t1 = (i + 1) * dt;
    if (v0 < -30 && v1 >= -30) spikes.push(t1 - dt + ((-30 - v0) / (v1 - v0)) * dt);
    if (t1 >= skip) {
      if (v1 < vMin) vMin = v1;
      if (v1 > vMax) vMax = v1;
    }
  }
  const late = spikes.filter((t) => t >= skip);
  const isi = late.length > 1 ? (late[late.length - 1] - late[0]) / (late.length - 1) : NaN;
  return { spikes, vMin, vMax, isi, rate: late.length > 1 ? 1000 / isi : 0, end: [s[cell.iv], s[cell.iCa], s[cell.ix]] };
}
