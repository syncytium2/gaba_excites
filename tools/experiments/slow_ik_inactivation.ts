/**
 * What would the slow inactivation of the GnRH neuron's K⁺ current measured by
 * DeFazio & Moenter (2021, eNeuro 8:ENEURO.0126-21.2021) do to the Adams et al.
 * (2018) model, whose I_K = g·m⁴ has no inactivation at all?
 *
 *   I_K → g·m⁴·(f0 + (1 − f0)·h_s)·(V − E_K)
 *   h_s∞: Boltzmann, V½ swept (the paper's −30 mV first), k = 4.7 mV   (Fig. 3C, E)
 *   τ_h:  3 s at −80 mV → 17 s at −30 mV, log-linear in V, clamped      (Fig. 3G, read by eye)
 *   f0 = 0.25: inactivation "level[s] off at ~30%"                        (Methods)
 *
 * An experiment, not part of the app: nothing here changes the shipped model.
 * Run: node tools/experiments/slow_ik_inactivation.ts   (about a minute)
 * Results and their reading: lit/notes/defazio2021.md.
 */
import { MODELS } from "../../src/core/models.ts";
import { makeGated, boltzmann, tauBell } from "../../src/core/channels.ts";
import { buildCell } from "../../src/core/cell.ts";
import { runSweep, settle, DEFAULT_SIM } from "../../src/core/simulate.ts";
import { detectSpikes } from "../../src/core/analysis.ts";
import { DEFAULT_GLU, DEFAULT_GABA } from "../../src/core/synapses.ts";
const orig = MODELS.gnrh.channels;
const tauH = (v: number) => { const x = Math.min(1, Math.max(0, (v + 80) / 50)); return 3000 * Math.pow(17 / 3, x); };
function variant(vh: number, f0 = 0.25) {
  (MODELS.gnrh as any).channels = () => orig().map((c) => c.channel.id !== "k" ? c : { ...c, channel: makeGated("k", "IK+s", [
    { name: "m", inf: boltzmann(-19.7, -12.3), tau: tauBell(23.8, 18, 23.8, -18, 10.6, 0) },
    { name: "hs", inf: boltzmann(vh, 4.7), tau: tauH }], (g, o) => g[o] ** 4 * (f0 + (1 - f0) * g[o + 1])) });
}
const E = { rs: 15, cp: 0, bridge: 1 };
const inp = { ihold: -6, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
function run(amp: number, dur: number) {
  const c = buildCell({ model: "gnrh", cm: 20, rin: 505.9 });
  const st = settle(c, E, -6, 8000, 0.01);
  const p = { sweepMs: dur + 200, stepStart: 100, stepDur: dur, amps: [amp] };
  const sw = runSweep(c, inp, p, amp, st, { ...DEFAULT_SIM, sampleMs: 0.05 }, 0);
  const t = detectSpikes(sw.vm, sw.sampleMs).map((s) => s.t);
  const i0 = Math.round(100 / 0.05), i1 = Math.round((100 + dur) / 0.05);
  let mv = 0, frac = 0; for (let i = i0; i < i1; i++) { mv += sw.vm[i]; if (sw.vm[i] > -45) frac++; }
  return { n: t.length, early: t.filter(x => x < 1100).length, late: t.filter(x => x >= dur - 900 && x < dur + 100).length, vmean: mv / (i1 - i0), fracAbove: frac / (i1 - i0), vs: sw.vm };
}
// where does the cell spend its time during 30 s at 24 pA?
(MODELS.gnrh as any).channels = orig;
const b = run(24, 30000);
console.log(`published: 30 s at 24 pA → ${b.n} spikes; first s ${b.early}, last s ${b.late}; mean Vm ${b.vmean.toFixed(1)} mV; time above −45 mV ${(100 * b.fracAbove).toFixed(1)}%`);
for (const vh of [-30, -40, -50, -55, -60, -65]) {
  variant(vh);
  const h = boltzmann(vh, 4.7);
  const r = run(24, 30000);
  // time-averaged h∞ over the step, a proxy for where the slow gate heads
  let hs = 0; const i0 = 2000, i1 = i0 + 600000; for (let i = i0; i < i1; i++) hs += h(r.vs[i]); hs /= (i1 - i0);
  const c = buildCell({ model: "gnrh", cm: 20, rin: 505.9 });
  console.log(`V½ ${vh}: rest ${c.vRest.toFixed(1)} mV, h∞(−70) ${h(-70).toFixed(2)}, <h∞> during step ${hs.toFixed(2)} → ${r.n} spikes; first s ${r.early}, last s ${r.late}`);
}
(MODELS.gnrh as any).channels = orig;
