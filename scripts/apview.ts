/**
 * One spike of any model, drawn so a person can measure it: V and dV/dt on one time axis, and the phase plot
 * (dV/dt against V), with a hover readout and click-to-pin. The owner used it on 2026-11-03 to read the human beta
 * cell's threshold criterion off the phase plot, and asked that it be kept.
 *
 *   node scripts/apview.ts --model betahuman --out spike.html
 *   node scripts/apview.ts --model gnrh --amp 30 --pin 1 --png spike.png
 *
 * The spike is the first (or `--spike n`th) upward crossing of the model's spike level after the step starts.
 * `--amp` is the step, pA; by default 1.5× the model's rheobase, or none for a cell that fires on its own.
 * `--pin c` marks where dV/dt first reaches c mV/ms on the upstroke (repeatable, comma-separated). V is the true
 * membrane potential, sampled at every integration step (0.01 ms); dV/dt is its centered difference, mV/ms (= V/s).
 * The page is self-contained: its data are inlined and it fetches nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildCell, publishedParams } from "../src/core/cell.ts";
import { MODELS, type ModelId } from "../src/core/models.ts";
import { DEFAULT_NOISE } from "../src/core/noise.ts";
import { DEFAULT_SIM, runSweep, settle, type Inputs } from "../src/core/simulate.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "../src/core/synapses.ts";
import { SPIKE_LEVEL } from "../src/core/analysis.ts";

export interface ApViewOptions {
  /** step amplitude, pA (default: 1.5× rheobase, or 0 for a cell that fires on its own) */
  amp?: number;
  /** which spike after the step starts, from 1 */
  spike?: number;
  /** window before and after the crossing, ms (default: from the neighboring spikes) */
  before?: number;
  after?: number;
  /** criteria to mark on the upstroke, mV/ms */
  pins?: number[];
}

export interface ApView {
  title: string;
  subtitle: string;
  /** sample interval, ms, and the time of the first sample relative to the crossing */
  dt: number;
  t0: number;
  v: number[];
  dvdt: number[];
  pins: { i: number; label: string; v: number; criterion: number }[];
  maxDvdt: number;
  vAtMaxDvdt: number;
  peak: number;
}

/** First index on the upstroke before `iCross` from which dV/dt stays at or above `c` up to the crossing. */
export function criterionIndex(dvdt: ArrayLike<number>, iCross: number, c: number): number {
  let j = iCross;
  while (j > 0 && dvdt[j - 1] >= c) j--;
  return dvdt[j] >= c ? j : -1;
}

export function apView(id: ModelId, o: ApViewOptions = {}): ApView {
  const model = MODELS[id];
  const cell = buildCell(publishedParams(id));
  const amp = o.amp ?? (model.rheobase > 0 ? Math.round(1.5 * model.rheobase) : 0);
  const inputs: Inputs = {
    ihold: model.defaults.ihold,
    electrode: { rs: 0, cp: 0, bridge: 1 },
    glu: DEFAULT_GLU,
    gaba: { ...DEFAULT_GABA, erev: model.defaults.eGaba, ...model.gabaKinetics },
    noise: { ...DEFAULT_NOISE, recSigma: 0, memSigma: 0 },
  };
  const proto = { sweepMs: 2300, stepStart: 100, stepDur: 2000, amps: [amp] };
  const opt = { ...DEFAULT_SIM, sampleMs: DEFAULT_SIM.dt };
  const st = settle(cell, inputs.electrode, inputs.ihold, model.settleMs, opt.dt);
  const sw = runSweep(cell, inputs, proto, amp, st, opt, 0);
  const vm = sw.vm, dt = sw.sampleMs, level = model.spikeLevel ?? SPIKE_LEVEL;

  const crossings: number[] = [];
  let armed = true;
  for (let i = Math.round(proto.stepStart / dt) + 1; i < vm.length; i++) {
    if (armed && vm[i - 1] < level && vm[i] >= level) { crossings.push(i); armed = false; }
    else if (!armed && vm[i] < level - 20) armed = true;
  }
  const k = (o.spike ?? 1) - 1;
  const c = crossings[k];
  if (c === undefined) throw new Error(`${model.label}: no spike ${k + 1} at ${amp} pA (${crossings.length} found)`);
  const gapBefore = k > 0 ? (c - crossings[k - 1]) * dt : 60;
  const gapAfter = crossings[k + 1] !== undefined ? (crossings[k + 1] - c) * dt : 60;
  const a = Math.max(1, c - Math.round((o.before ?? Math.min(150, 0.6 * gapBefore)) / dt));
  const b = Math.min(vm.length - 2, c + Math.round((o.after ?? Math.min(100, 0.4 * gapAfter)) / dt));

  const v: number[] = [], dvdt: number[] = [];
  for (let i = a; i <= b; i++) { v.push(+vm[i].toFixed(4)); dvdt.push(+((vm[i + 1] - vm[i - 1]) / (2 * dt)).toFixed(4)); }
  let iMax = 0;
  dvdt.forEach((d, i) => { if (d > dvdt[iMax]) iMax = i; });
  const pins = (o.pins ?? []).flatMap((crit) => {
    const i = criterionIndex(dvdt, c - a, crit);
    return i < 0 ? [] : [{ i, v: v[i], criterion: crit, label: `${crit} mV/ms` }];
  });
  return {
    title: `${model.label}: one spike, V and dV/dt`,
    subtitle: `${model.citation}. Published parameters, ${amp ? `a ${amp} pA step` : "no current injected"}, spike ${k + 1}, dt ${dt} ms; dV/dt is the centered difference of V, mV/ms (= V/s).`,
    dt, t0: (a - c) * dt, v, dvdt, pins,
    maxDvdt: dvdt[iMax], vAtMaxDvdt: v[iMax], peak: Math.max(...v),
  };
}

export function apViewHtml(d: ApView): string {
  const tpl = readFileSync(fileURLToPath(new URL("./apview.html", import.meta.url)), "utf8");
  return tpl.replace("__DATA__", JSON.stringify(d));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values: a } = parseArgs({
    options: {
      model: { type: "string", default: "betahuman" }, amp: { type: "string" }, spike: { type: "string" },
      before: { type: "string" }, after: { type: "string" }, pin: { type: "string" },
      out: { type: "string" }, png: { type: "string" }, help: { type: "boolean", short: "h" },
    },
  });
  if (a.help) {
    console.log(`usage: node scripts/apview.ts [--model ${Object.keys(MODELS).join("|")}] [--amp pA] [--spike n] [--before ms] [--after ms] [--pin c1,c2] [--out page.html] [--png figure.png]`);
    process.exit(0);
  }
  if (!(a.model! in MODELS)) throw new Error(`--model must be one of ${Object.keys(MODELS).join(", ")}`);
  const num = (s?: string) => (s === undefined ? undefined : +s);
  const d = apView(a.model as ModelId, {
    amp: num(a.amp), spike: num(a.spike), before: num(a.before), after: num(a.after),
    pins: a.pin ? a.pin.split(",").map(Number) : [],
  });
  console.log(`peak ${d.peak.toFixed(2)} mV; max dV/dt ${d.maxDvdt.toFixed(2)} mV/ms at ${d.vAtMaxDvdt.toFixed(2)} mV`);
  for (const p of d.pins) console.log(`dV/dt reaches ${p.criterion} mV/ms at ${p.v.toFixed(2)} mV`);
  const html = apViewHtml(d);
  if (a.out) writeFileSync(a.out, html);
  if (a.png) {
    // a picture of the page, for a document that cannot hold a live one (an ADR); playwright-core, as screenshot.mjs
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: process.env.CHROMIUM_ARGS ? [process.env.CHROMIUM_ARGS] : [] });
    const page = await browser.newPage({ viewport: { width: 1130, height: 720 }, deviceScaleFactor: 2 });
    await page.setContent(html);
    await page.screenshot({ path: a.png, fullPage: true });
    await browser.close();
  }
}
