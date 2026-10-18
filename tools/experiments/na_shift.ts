/**
 * How do shifts in the voltage dependence of the Traub Na⁺ channel change
 * excitability, and does the same shift do the same thing in the pyramidal
 * (rs) and fast-spiking (fs) cells? Both cells carry the same Na⁺ channel
 * (makeNa(−55), 50 mS/cm²); they differ in their K⁺ currents and size.
 *
 *   activation shift  ΔVm:  m∞, τm evaluated at V − ΔVm   (positive = curve moves depolarized)
 *   inactivation shift ΔVh: h∞, τh evaluated at V − ΔVh
 *   whole channel: ΔVm = ΔVh
 *
 * Each gate is advanced by its own stock makeNa instance (vtraub − 55 + Δ), so
 * the kinetics are the shipped ones, moved along the voltage axis. Rush–Larsen
 * gates are independent, so splitting them across two instances is exact.
 *
 * Two views of each condition, as the channel-editor handoff asks:
 *   free: no holding current; the shift may move rest.
 *   held: the holding current that puts the edited cell at the control cell's
 *         rest, read straight off the steady-state I–V (no search).
 * Rheobase, threshold and latency are measured from the held start, the only
 * fair comparison of threshold.
 *
 * An experiment, not part of the app: nothing here changes the shipped model.
 * `withNaShift` swaps the channel in for the duration of a callback and always
 * restores the published channels. src/experiments.test.ts keeps it working.
 *
 * Run the table: node tools/experiments/na_shift.ts
 */
import { fileURLToPath } from "node:url";
import { MODELS, type ModelId } from "../../src/core/models.ts";
import { makeNa, type Channel } from "../../src/core/channels.ts";
import { buildCell, iSteady, publishedParams, type BuiltCell } from "../../src/core/cell.ts";
import { DEFAULT_SIM, runSweep, settle, type Inputs } from "../../src/core/simulate.ts";
import { detectSpikes, sweepStats } from "../../src/core/analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "../../src/core/synapses.ts";

const VTRAUB = -55;

/** The Traub Na⁺ channel with its activation and inactivation moved separately along the voltage axis. */
export function shiftedNa(dAct: number, dInact: number): Channel {
  const m = makeNa(VTRAUB + dAct);
  const h = makeNa(VTRAUB + dInact);
  const tmp = new Float64Array(2);
  return {
    id: "na",
    label: `INa (Traub), act ${dAct >= 0 ? "+" : ""}${dAct}, inact ${dInact >= 0 ? "+" : ""}${dInact} mV`,
    nGates: 2,
    gateNames: ["m", "h"],
    init(v, s, o) {
      m.init(v, tmp, 0);
      s[o] = tmp[0];
      h.init(v, tmp, 0);
      s[o + 1] = tmp[1];
    },
    advance(v, dt, s, o) {
      tmp[0] = s[o];
      tmp[1] = s[o + 1];
      m.advance(v, dt, tmp, 0);
      const mNew = tmp[0];
      tmp[0] = s[o];
      tmp[1] = s[o + 1];
      h.advance(v, dt, tmp, 0);
      s[o] = mNew;
      s[o + 1] = tmp[1];
    },
    open(s, o) {
      const x = s[o];
      return x * x * x * s[o + 1];
    },
    openInf(v) {
      m.init(v, tmp, 0);
      const x = tmp[0];
      h.init(v, tmp, 0);
      return x * x * x * tmp[1];
    },
  };
}

/** Run `fn` with the model's Na⁺ channel shifted; the published model is restored afterwards. */
export function withNaShift<T>(model: "rs" | "fs", dAct: number, dInact: number, fn: () => T): T {
  const published = MODELS[model].channels;
  MODELS[model].channels = () => published().map((c) => (c.channel.id === "na" ? { ...c, channel: shiftedNa(dAct, dInact) } : c));
  try {
    return fn();
  } finally {
    MODELS[model].channels = published;
  }
}

const E = { rs: 15, cp: 0, bridge: 1 };
const proto = (a: number) => ({ sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [a] });

/** Holding current (pA) that makes `v` the steady state, and whether that steady state is stable (positive I–V slope). */
export function holdAt(cell: BuiltCell, v: number): { ihold: number; stable: boolean } {
  const g = (x: number) => iSteady(cell, cell.gLeak, x);
  return { ihold: g(v), stable: g(v + 0.01) - g(v - 0.01) > 0 };
}

export interface Excitability {
  vRest: number;
  rin: number;
  ihold: number;
  stable: boolean;
  rheobase: number;
  threshold: number;
  gap: number;
  /** latency to first spike at the given fixed current, ms */
  latency: number;
  /** mean rate over the step at the given fixed current, Hz */
  rate: number;
  /** false when the first spike at the fixed current never falls back below −40 mV */
  repolarizes: boolean;
}

/**
 * The excitability measures of the current model, started from `vStart`
 * (held there). `iLat` and `iRate` are fixed currents above the hold, so
 * every condition gets the same drive.
 */
export function measure(model: ModelId, vStart: number, iLat: number, iRate: number): Excitability {
  const cell = buildCell(publishedParams(model));
  const { ihold, stable } = holdAt(cell, vStart);
  const inputs: Inputs = { ihold, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
  const st = settle(cell, E, ihold, MODELS[model].settleMs, DEFAULT_SIM.dt);
  const sweep = (a: number) => runSweep(cell, inputs, proto(a), a, st, DEFAULT_SIM, 0);
  const fires = (a: number) => sweepStats(sweep(a), proto(a)).nInStep > 0;

  let lo = 0;
  let hi = 2000;
  let rheobase = NaN;
  if (fires(0)) rheobase = 0;
  else if (fires(hi)) {
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      if (fires(mid)) hi = mid;
      else lo = mid;
    }
    rheobase = hi;
  }
  const atRheo = Number.isNaN(rheobase) ? null : sweepStats(sweep(rheobase), proto(rheobase));
  const threshold = atRheo?.spikes[0]?.threshold ?? NaN;

  const lat = sweepStats(sweep(iLat), proto(iLat));
  const fixed = sweep(iRate);
  const rate = sweepStats(fixed, proto(iRate)).meanRate;
  const sp = detectSpikes(fixed.vm, fixed.sampleMs);
  let repolarizes = true;
  if (sp.length) {
    const i0 = Math.round(sp[0].t / fixed.sampleMs);
    const i1 = Math.min(fixed.vm.length, Math.round((100 + 800) / fixed.sampleMs));
    repolarizes = false;
    for (let i = i0; i < i1; i++)
      if (fixed.vm[i] < -40) {
        repolarizes = true;
        break;
      }
  }
  return {
    vRest: cell.vRest,
    rin: cell.rinRest,
    ihold,
    stable,
    rheobase,
    threshold,
    gap: threshold - vStart,
    latency: lat.latency,
    rate,
    repolarizes,
  };
}

/** The shifts swept, mV: activation alone, inactivation alone, then the whole channel. */
export const SHIFTS: [number, number][] = [
  [0, 0],
  [-6, 0], [-3, 0], [3, 0], [6, 0],
  [0, -6], [0, -3], [0, 3], [0, 6],
  [-6, -6], [-3, -3], [3, 3], [6, 6],
];

/** Control rest and rheobase, and the fixed currents every condition gets: 1.5× and 2× control rheobase. */
export function control(model: "rs" | "fs") {
  const c0 = buildCell(publishedParams(model));
  const base = measure(model, c0.vRest, 0, 0);
  return { vRest: c0.vRest, rheobase: base.rheobase, iLat: 1.5 * base.rheobase, iRate: 2 * base.rheobase };
}

export function sweepShifts(model: "rs" | "fs", shifts = SHIFTS) {
  const c = control(model);
  return shifts.map(([dA, dI]) => ({ dA, dI, ...withNaShift(model, dA, dI, () => measure(model, c.vRest, c.iLat, c.iRate)) }));
}

// ---------------------------------------------------------------- the table

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");
  for (const model of ["rs", "fs"] as const) {
    const c = control(model);
    console.log(`\n## ${model}: control rest ${f(c.vRest)} mV, rheobase ${f(c.rheobase, 0)} pA; latency at ${f(c.iLat, 0)} pA, rate at ${f(c.iRate, 0)} pA (both on top of the hold)`);
    console.log("| ΔV act | ΔV inact | free rest | Rin | hold to control rest | rheobase | threshold | gap | latency | rate | repolarizes |");
    console.log("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of sweepShifts(model))
      console.log(
        `| ${r.dA} | ${r.dI} | ${f(r.vRest)} mV | ${f(r.rin)} MΩ | ${f(r.ihold)} pA${r.stable ? "" : " (unstable)"} | ${f(r.rheobase, 0)} pA | ` +
          `${f(r.threshold)} mV | ${f(r.gap)} mV | ${f(r.latency)} ms | ${f(r.rate)} Hz | ${r.repolarizes ? "yes" : "**no**"} |`,
      );
  }
}
