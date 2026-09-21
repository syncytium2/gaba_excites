/**
 * F–I from the command line, with the same code the app runs.
 *
 *   node scripts/fi.ts                                 # published cell, -200..1000 by 100
 *   node scripts/fi.ts --rin 150 --cm 120 --steps 0,50,100,150,200
 *   node scripts/fi.ts --gaba 200,3,0.5,10,-60 --rheobase
 *
 * --glu / --gaba take rate_Hz,gPeak_nS,tauRise_ms,tauDecay_ms[,E_mV]; add
 * --regular for clock-like trains. Output is CSV on stdout, settings as # lines.
 */
import { parseArgs } from "node:util";
import { buildCell, cellRinAt, publishedParams } from "../src/core/cell.ts";
import { MODELS, type ModelId } from "../src/core/models.ts";
import { DEFAULT_NOISE } from "../src/core/noise.ts";
import { runFamily, runSweep, settle, DEFAULT_SIM } from "../src/core/simulate.ts";
import { summarize, sweepStats } from "../src/core/analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU, type SynInput } from "../src/core/synapses.ts";

const { values: a } = parseArgs({
  options: {
    model: { type: "string", default: "rs" },
    rin: { type: "string" }, cm: { type: "string" }, ihold: { type: "string" },
    "rec-noise": { type: "string", default: "0" }, "mem-noise": { type: "string" },
    rs: { type: "string", default: "15" }, steps: { type: "string", default: "-200,-100,0,100,200,300,400,500,600,700,800,900,1000" },
    "step-start": { type: "string", default: "100" }, "step-dur": { type: "string", default: "800" }, sweep: { type: "string", default: "1000" },
    glu: { type: "string" }, gaba: { type: "string" }, regular: { type: "boolean", default: false },
    seed: { type: "string", default: "1" }, rheobase: { type: "boolean", default: false }, help: { type: "boolean", short: "h" },
  },
});
if (a.help) {
  console.log("usage: node scripts/fi.ts [--model rs|gnrh] [--rin MOhm] [--cm pF] [--ihold pA] [--rs MOhm] [--steps a,b,c] [--step-start ms] [--step-dur ms] [--sweep ms] [--glu r,g,tr,td] [--gaba r,g,tr,td,E] [--regular] [--seed n] [--rheobase] [--rec-noise mV] [--mem-noise sigma_pA,tau_ms]");
  process.exit(0);
}

function syn(base: SynInput, spec?: string): SynInput {
  if (!spec) return base;
  const [rate, gPeak, tauRise, tauDecay, erev] = spec.split(",").map(Number);
  return { ...base, enabled: true, rate, gPeak, tauRise, tauDecay, erev: Number.isFinite(erev) ? erev : base.erev, pattern: a.regular ? "regular" : "poisson" };
}

if (!(a.model! in MODELS)) throw new Error(`--model must be one of ${Object.keys(MODELS).join(", ")}`);
const model = MODELS[a.model as ModelId];
const cellP = { ...publishedParams(model.id), ...(a.rin ? { rin: +a.rin } : {}), ...(a.cm ? { cm: +a.cm } : {}) };
const cell = buildCell(cellP);
const [memSigma, memTau] = (a["mem-noise"] ?? "0,5").split(",").map(Number);
const noise = { ...DEFAULT_NOISE, recSigma: +a["rec-noise"]!, memSigma, memTau: memTau || 5 };
const inputs = { ihold: a.ihold !== undefined ? +a.ihold : model.defaults.ihold, electrode: { rs: +a.rs!, cp: 0, bridge: 1 }, glu: syn(DEFAULT_GLU, a.glu), gaba: syn(DEFAULT_GABA, a.gaba), noise };
const proto = { sweepMs: +a.sweep!, stepStart: +a["step-start"]!, stepDur: +a["step-dur"]!, amps: a.steps!.split(",").map(Number) };
const opt = { ...DEFAULT_SIM, seed: +a.seed! };

const s = summarize(runFamily(cell, inputs, proto, opt), proto);
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "");
console.log(`# gaba_excites CLI — ${model.label}: ${model.citation}`);
console.log(`# Rin ${cellP.rin} MOhm (leak ${f(cell.gLeak)} nS${cell.rinClamped ? ", CLAMPED" : ""}), Cm ${cellP.cm} pF, Ihold ${inputs.ihold} pA, rest ${f(cell.vRest)} mV, Rin at Ihold ${f(cellRinAt(cell, inputs.ihold))} MOhm`);
console.log(`# step ${proto.stepStart}+${proto.stepDur} ms in ${proto.sweepMs} ms; dt ${opt.dt} ms; seed ${opt.seed}`);
console.log(`# noise: recording ${noise.recSigma} mV RMS; membrane ${noise.memSigma} pA SD, tau ${noise.memTau} ms`);
for (const [n, x] of [["glutamate", inputs.glu], ["GABA", inputs.gaba]] as const)
  console.log(`# ${n}: ${x.enabled ? `${x.rate} Hz, ${x.gPeak} nS, ${x.tauRise}/${x.tauDecay} ms, E ${x.erev} mV, ${x.pattern}` : "off"}`);
console.log(`# rheobase ${f(s.rheobase, 0)} pA (step resolution), threshold ${f(s.threshold)} mV, Rin measured ${f(s.rinMeasured)} MOhm, F-I gain ${f(s.fiGain, 1)} Hz/nA`);

if (a.rheobase) {
  const st = settle(cell, inputs.electrode, inputs.ihold, opt.settleMs ?? cell.model.settleMs, opt.dt);
  const fires = (amp: number) => sweepStats(runSweep(cell, inputs, proto, amp, st, opt, 0), proto).nInStep > 0;
  let lo = -2000, hi = 5000;
  if (!fires(hi)) console.log("# rheobase refined: none below 5000 pA");
  else {
    while (hi - lo > 1) { const m = (lo + hi) / 2; if (fires(m)) hi = m; else lo = m; }
    console.log(`# rheobase refined: ${hi.toFixed(0)} pA (±1)`);
  }
}
console.log("step_pA,spikes,mean_Hz,initial_Hz,final_Hz,latency_ms,v_baseline_mV,v_steady_mV");
for (const x of s.stats) console.log([x.amp, x.nInStep, f(x.meanRate), f(x.initialRate), f(x.finalRate), f(x.latency), f(x.vBaseline), f(x.vSteady)].join(","));
