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
 * `withSlowIk` swaps the gate in for the duration of a callback and always
 * restores the published channels. src/experiments.test.ts keeps it working.
 *
 * Run the full sweep: node tools/experiments/slow_ik_inactivation.ts   (about a minute)
 * Results and their reading: lit/notes/defazio2021.md.
 */
import { fileURLToPath } from "node:url";
import { MODELS } from "../../src/core/models.ts";
import { boltzmann, makeGated, tauBell } from "../../src/core/channels.ts";
import { buildCell } from "../../src/core/cell.ts";
import { DEFAULT_SIM, runSweep, settle } from "../../src/core/simulate.ts";
import { detectSpikes, sweepStats } from "../../src/core/analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "../../src/core/synapses.ts";

/** τ of the slow gate, ms: 3 s at −80 mV to 17 s at −30 mV, log-linear, clamped outside. */
export function tauSlow(v: number): number {
  const x = Math.min(1, Math.max(0, (v + 80) / 50));
  return 3000 * Math.pow(17 / 3, x);
}

/** Run `fn` with the GnRH model's I_K given slow inactivation; the published model is restored afterwards. */
export function withSlowIk<T>(vHalf: number, fn: () => T, f0 = 0.25): T {
  const published = MODELS.gnrh.channels;
  MODELS.gnrh.channels = () =>
    published().map((c) =>
      c.channel.id !== "k"
        ? c
        : {
            ...c,
            channel: makeGated("k", "IK + slow inactivation", [
              // Adams 2018 activation, unchanged
              { name: "m", inf: boltzmann(-19.7, -12.3), tau: tauBell(23.8, 18, 23.8, -18, 10.6, 0) },
              // DeFazio & Moenter 2021 inactivation
              { name: "hs", inf: boltzmann(vHalf, 4.7), tau: tauSlow },
            ], (g, o) => g[o] ** 4 * (f0 + (1 - f0) * g[o + 1])),
          },
    );
  try {
    return fn();
  } finally {
    MODELS.gnrh.channels = published;
  }
}

const E = { rs: 15, cp: 0, bridge: 1 };
const INPUTS = { ihold: -6, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };

/** Spike counts for the paper's Fig. 7F protocol (0–30 pA, 500 ms, on −6 pA). */
export function fig7fCounts(): number[] {
  const cell = buildCell({ model: "gnrh", cm: 20, gLeak: 1 });
  const st = settle(cell, E, -6, 8000, 0.01);
  const p = { sweepMs: 700, stepStart: 100, stepDur: 500, amps: [0, 6, 12, 18, 24, 30] };
  return p.amps.map((a, k) => sweepStats(runSweep(cell, INPUTS, p, a, st, DEFAULT_SIM, k), p).nInStep);
}

/** A long step: spike count, first- and last-second counts, mean Vm, and time spent above −45 mV. */
export function longStep(amp: number, durMs: number) {
  const cell = buildCell({ model: "gnrh", cm: 20, gLeak: 1 });
  const st = settle(cell, E, -6, 8000, 0.01);
  const p = { sweepMs: durMs + 200, stepStart: 100, stepDur: durMs, amps: [amp] };
  const sw = runSweep(cell, INPUTS, p, amp, st, { ...DEFAULT_SIM, sampleMs: 0.05 }, 0);
  const t = detectSpikes(sw.vm, sw.sampleMs).map((s) => s.t);
  const i0 = Math.round(100 / sw.sampleMs);
  const i1 = Math.round((100 + durMs) / sw.sampleMs);
  let mean = 0;
  let above = 0;
  for (let i = i0; i < i1; i++) {
    mean += sw.vm[i];
    if (sw.vm[i] > -45) above++;
  }
  return {
    spikes: t.length,
    firstSecond: t.filter((x) => x < 1100).length,
    lastSecond: t.filter((x) => x >= durMs - 900 && x < durMs + 100).length,
    meanVm: mean / (i1 - i0),
    fracAbove45: above / (i1 - i0),
    vm: sw.vm.subarray(i0, i1),
  };
}

/** Time-averaged h∞ over a voltage trace: where the slow gate is heading. */
export function meanHInf(vm: Float32Array, vHalf: number): number {
  const h = boltzmann(vHalf, 4.7);
  let s = 0;
  for (let i = 0; i < vm.length; i++) s += h(vm[i]);
  return s / vm.length;
}

// ---------------------------------------------------------------- the sweep in lit/notes/defazio2021.md

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const b = longStep(24, 30000);
  console.log(
    `published: 30 s at 24 pA → ${b.spikes} spikes; first s ${b.firstSecond}, last s ${b.lastSecond}; ` +
      `mean Vm ${b.meanVm.toFixed(1)} mV; time above −45 mV ${(100 * b.fracAbove45).toFixed(1)}%`,
  );
  for (const vh of [-30, -40, -50, -55, -60, -65]) {
    withSlowIk(vh, () => {
      const r = longStep(24, 30000);
      const rest = buildCell({ model: "gnrh", cm: 20, gLeak: 1 }).vRest;
      console.log(
        `V½ ${vh}: rest ${rest.toFixed(1)} mV, h∞(−70) ${boltzmann(vh, 4.7)(-70).toFixed(2)}, ` +
          `<h∞> during step ${meanHInf(r.vm, vh).toFixed(2)} → ${r.spikes} spikes; first s ${r.firstSecond}, last s ${r.lastSecond}` +
          (vh === -30 ? `; Fig. 7F counts ${fig7fCounts().join("/")}` : ""),
      );
    });
  }
}
