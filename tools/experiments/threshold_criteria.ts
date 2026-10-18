/**
 * Does "threshold" depend on how it is defined, and does that change what Na⁺ and K⁺
 * channel changes appear to do to it, across cell types?
 *
 * Threshold here is Vm where dV/dt first reaches a criterion on the upstroke, found by
 * walking back from the −20 mV crossing (src/core/analysis.ts does the same at 20 V/s).
 * The criteria swept are 1, 2, 10 and 20 V/s (Kress et al. 2010 used 10).
 *
 * The cells are the pyramidal (rs), fast-spiking (fs) and GnRH models. The edits are:
 *   Na⁺: a whole-channel shift of ±6 mV (gates evaluated at V − ΔV), and conductance × 0.5.
 *        On GnRH that is the Markov fast Na⁺ channel (naf) only; INaP is left alone.
 *   K⁺:  per cell, the K⁺ currents it has: halved or blocked.
 *
 * Each edited cell is held at the control cell's starting potential (the model's own
 * holding current, read off the steady-state I–V), the only fair comparison of threshold.
 * When the edit leaves no stable steady state there, the result says so.
 *
 * An experiment, not part of the app: nothing here changes the shipped model. `withEdits`
 * swaps the channels for the duration of a callback and always restores the published
 * ones. src/experiments.test.ts keeps it working.
 *
 * Run the table: node tools/experiments/threshold_criteria.ts [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MODELS, type ModelId } from "../../src/core/models.ts";
import type { Channel } from "../../src/core/channels.ts";
import { buildCell, cellSteadyV, publishedParams } from "../../src/core/cell.ts";
import { DEFAULT_SIM, runSweep, settle, type Inputs, type Sweep } from "../../src/core/simulate.ts";
import { detectSpikes, sweepStats } from "../../src/core/analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "../../src/core/synapses.ts";
import { holdAt } from "./na_shift.ts";

export const CRITERIA = [1, 2, 10, 20] as const;

export interface Edit {
  /** conductance multiplier (0 blocks) */
  g?: number;
  /** whole-channel voltage shift, mV; positive moves every gate's curve depolarized */
  shift?: number;
}
export type Edits = Record<string, Edit>;

/** The channel with every gate evaluated at V − d: its whole voltage dependence moved by d. */
export function shifted(ch: Channel, d: number): Channel {
  return {
    ...ch,
    label: `${ch.label} shifted ${d >= 0 ? "+" : ""}${d} mV`,
    init: (v, s, o) => ch.init(v - d, s, o),
    advance: (v, dt, s, o) => ch.advance(v - d, dt, s, o),
    open: (s, o, ca) => ch.open(s, o, ca),
    openInf: (v, ca) => ch.openInf(v - d, ca),
  };
}

/** Run `fn` with the model's channels edited; the published model is restored afterwards. */
export function withEdits<T>(model: ModelId, edits: Edits, fn: () => T): T {
  const published = MODELS[model].channels;
  MODELS[model].channels = () =>
    published().map((c) => {
      const e = edits[c.channel.id];
      if (!e) return c;
      return { ...c, gbar: c.gbar * (e.g ?? 1), channel: e.shift ? shifted(c.channel, e.shift) : c.channel };
    });
  try {
    return fn();
  } finally {
    MODELS[model].channels = published;
  }
}

export interface Condition {
  id: string;
  label: string;
  kind: "control" | "Na" | "K";
  edits: Edits;
}

const NA: Record<ModelId, string> = { rs: "na", fs: "na", gnrh: "naf" };

/** The conditions run on each cell: control, three Na⁺ edits, and the K⁺ edits that cell has channels for. */
export function conditions(model: ModelId): Condition[] {
  const na = NA[model];
  const c: Condition[] = [
    { id: "control", label: "control", kind: "control", edits: {} },
    { id: "na-6", label: "Na⁺ −6 mV", kind: "Na", edits: { [na]: { shift: -6 } } },
    { id: "na+6", label: "Na⁺ +6 mV", kind: "Na", edits: { [na]: { shift: 6 } } },
    { id: "na-half", label: "gNa × 0.5", kind: "Na", edits: { [na]: { g: 0.5 } } },
  ];
  const k: Record<ModelId, Condition[]> = {
    rs: [
      { id: "kd-half", label: "gKd × 0.5", kind: "K", edits: { kd: { g: 0.5 } } },
      { id: "kd-0", label: "Kd blocked", kind: "K", edits: { kd: { g: 0 } } },
      { id: "m-0", label: "M blocked", kind: "K", edits: { m: { g: 0 } } },
    ],
    fs: [
      { id: "kd-half", label: "gKd × 0.5", kind: "K", edits: { kd: { g: 0.5 } } },
      { id: "kd-0", label: "Kd blocked", kind: "K", edits: { kd: { g: 0 } } },
    ],
    gnrh: [
      { id: "a-0", label: "I_A blocked", kind: "K", edits: { a: { g: 0 } } },
      { id: "k-half", label: "gK × 0.5", kind: "K", edits: { k: { g: 0.5 } } },
      { id: "k-0", label: "I_K blocked", kind: "K", edits: { k: { g: 0 } } },
      { id: "kca-0", label: "I_KCa blocked", kind: "K", edits: { kca: { g: 0 } } },
    ],
  };
  return [...c, ...k[model]];
}

const E = { rs: 15, cp: 0, bridge: 1 };
export const STEP = { sweepMs: 1000, stepStart: 100, stepDur: 800 };
const proto = (a: number) => ({ ...STEP, amps: [a] });

export interface CriterionThreshold {
  /** V/s */
  crit: number;
  /** mV; NaN without a spike */
  v: number;
  /** ms from step onset to the threshold sample */
  t: number;
  /** the walk-back reached the step onset: the criterion caught the charging, not the spike */
  hitOnset: boolean;
}

/**
 * Threshold of the spike whose −20 mV crossing is at sample `i`, at criterion `crit` V/s:
 * walk back while dV/dt ≥ crit, never past the step onset.
 */
export function thresholdAt(vm: Float32Array, dt: number, i: number, crit: number, onsetIdx: number): CriterionThreshold {
  let j = i;
  while (j > onsetIdx + 1 && (vm[j - 1] - vm[j - 2]) / dt >= crit) j--;
  const k = Math.max(j - 1, 0);
  return { crit, v: vm[k], t: (k - onsetIdx) * dt, hitOnset: j <= onsetIdx + 1 };
}

export interface Result {
  model: ModelId;
  condition: Condition;
  vStart: number;
  ihold: number;
  stable: boolean;
  /** rest of the edited cell with the model's default holding current and no correction, mV */
  vFree: number;
  rheobase: number;
  latency: number;
  /** first-spike latency at a fixed current (1.5× control rheobase), ms; NaN if no spike */
  latencyFixed: number;
  iFixed: number;
  thresholds: CriterionThreshold[];
  /** the rheobase sweep, for plotting */
  sweep: Sweep | null;
  /** index of the first spike's −20 mV crossing in `sweep` */
  iCross: number;
}

/** Control's starting potential: the published cell at its default holding current. */
export function startV(model: ModelId): number {
  return cellSteadyV(buildCell(publishedParams(model)), MODELS[model].defaults.ihold);
}

export function measure(model: ModelId, cond: Condition, vStart = startV(model), iFixed = NaN): Result {
  return withEdits(model, cond.edits, () => {
    const cell = buildCell(publishedParams(model));
    const { ihold, stable } = holdAt(cell, vStart);
    const vFree = cellSteadyV(cell, MODELS[model].defaults.ihold);
    const inputs: Inputs = { ihold, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
    const st = settle(cell, E, ihold, MODELS[model].settleMs, DEFAULT_SIM.dt);
    const sweep = (a: number) => runSweep(cell, inputs, proto(a), a, st, DEFAULT_SIM, 0);
    const fires = (a: number) => sweepStats(sweep(a), proto(a)).nInStep > 0;
    const top = model === "gnrh" ? 200 : 3000;
    const tol = model === "gnrh" ? 0.1 : 1;
    let rheobase = NaN;
    if (fires(0)) rheobase = 0;
    else if (fires(top)) {
      let lo = 0;
      let hi = top;
      while (hi - lo > tol) {
        const mid = (lo + hi) / 2;
        if (fires(mid)) hi = mid;
        else lo = mid;
      }
      rheobase = hi;
    }
    const fx = Number.isFinite(iFixed) ? sweepStats(sweep(iFixed), proto(iFixed)).latency : NaN;
    const empty = { model, condition: cond, vStart, ihold, stable, vFree, rheobase, latency: NaN, latencyFixed: fx, iFixed, sweep: null, iCross: -1 };
    if (Number.isNaN(rheobase)) return { ...empty, thresholds: CRITERIA.map((crit) => ({ crit, v: NaN, t: NaN, hitOnset: false })) };
    const sw = sweep(rheobase);
    const dt = sw.sampleMs;
    const onsetIdx = Math.round(STEP.stepStart / dt);
    const sp = detectSpikes(sw.vm, dt).find((s) => s.t >= STEP.stepStart);
    if (!sp) return { ...empty, thresholds: CRITERIA.map((crit) => ({ crit, v: NaN, t: NaN, hitOnset: false })) };
    const iCross = Math.ceil(sp.t / dt);
    return {
      ...empty,
      latency: sp.t - STEP.stepStart,
      thresholds: CRITERIA.map((crit) => thresholdAt(sw.vm, dt, iCross, crit, onsetIdx)),
      sweep: sw,
      iCross,
    };
  });
}

export function runAll(models: ModelId[] = ["rs", "fs", "gnrh"]): Result[] {
  const out: Result[] = [];
  for (const m of models) {
    const v0 = startV(m);
    const [ctl, ...rest] = conditions(m);
    const c0 = measure(m, ctl, v0);
    const iFixed = 1.5 * c0.rheobase;
    out.push(measure(m, ctl, v0, iFixed));
    for (const c of rest) out.push(measure(m, c, v0, iFixed));
  }
  return out;
}

/**
 * Threshold against drive: the edited and control cells, each held at `vHold`, stepped at
 * multiples of its own rheobase. A K⁺ current that inactivates (GnRH's I_A) can only shape
 * threshold while it is still available, so its effect shows at short latency and from
 * hyperpolarized holding potentials, not at rheobase, where the spike comes late.
 */
export function driveSweep(model: ModelId, edits: Edits, vHold: number, mults = [1, 1.1, 1.25, 1.5, 2, 3, 5]) {
  return withEdits(model, edits, () => {
    const cell = buildCell(publishedParams(model));
    const { ihold, stable } = holdAt(cell, vHold);
    const inputs: Inputs = { ihold, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
    const st = settle(cell, E, ihold, MODELS[model].settleMs, DEFAULT_SIM.dt);
    const fires = (a: number) => sweepStats(runSweep(cell, inputs, proto(a), a, st, DEFAULT_SIM, 0), proto(a)).nInStep > 0;
    let lo = 0;
    let hi = model === "gnrh" ? 300 : 4000;
    const tol = model === "gnrh" ? 0.1 : 1;
    while (hi - lo > tol) {
      const mid = (lo + hi) / 2;
      if (fires(mid)) hi = mid;
      else lo = mid;
    }
    const rows = mults.map((mult) => {
      const amp = mult * hi;
      const sw = runSweep(cell, inputs, proto(amp), amp, st, DEFAULT_SIM, 0);
      const dt = sw.sampleMs;
      const sp = detectSpikes(sw.vm, dt).find((x) => x.t >= STEP.stepStart);
      if (!sp) return { mult, amp, latency: NaN, thresholds: [] as CriterionThreshold[] };
      const onset = Math.round(STEP.stepStart / dt);
      const ic = Math.ceil(sp.t / dt);
      return { mult, amp, latency: sp.t - STEP.stepStart, thresholds: CRITERIA.map((c) => thresholdAt(sw.vm, dt, ic, c, onset)) };
    });
    return { ihold, stable, rheobase: hi, rows };
  });
}

// ---------------------------------------------------------------- the table

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");
  const res = runAll();
  console.log("| cell | condition | hold | free rest | rheobase | latency | latency @1.5× ctl | " + CRITERIA.map((c) => `thr @${c} V/s`).join(" | ") + " |");
  console.log("|---|---|---|---|---|---|---|" + CRITERIA.map(() => "---").join("|") + "|");
  for (const r of res)
    console.log(
      `| ${r.model} | ${r.condition.label} | ${f(r.ihold)} pA${r.stable ? "" : " (unstable)"} | ${f(r.vFree)} mV | ${f(r.rheobase, 1)} pA | ${f(r.latency)} ms | ${f(r.latencyFixed)} ms | ` +
        r.thresholds.map((t) => `${f(t.v)}${t.hitOnset ? "*" : ""}`).join(" | ") +
        " |",
    );
  console.log("\n* the walk-back reached the step onset: that criterion caught the charging transient, not the spike.");
  const j = process.argv.indexOf("--json");
  if (j > 0) {
    const pre = 60; // ms of trace kept before the threshold window
    const slim = res.map((r) => {
      let trace = null;
      if (r.sweep) {
        const dt = r.sweep.sampleMs;
        const a = Math.max(0, Math.round((STEP.stepStart - 20) / dt));
        const b = Math.min(r.sweep.vm.length, r.iCross + Math.round(15 / dt));
        trace = { dt, t0: a * dt, vm: Array.from(r.sweep.vm.subarray(a, b), (x) => Math.round(x * 1000) / 1000) };
      }
      void pre;
      return { ...r, sweep: undefined, trace };
    });
    writeFileSync(process.argv[j + 1], JSON.stringify({ step: STEP, criteria: CRITERIA, results: slim }));
  }
}
