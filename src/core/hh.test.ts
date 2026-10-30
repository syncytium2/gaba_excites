/**
 * The Hodgkin–Huxley squid axon against NEURON's built-in hh mechanism:
 * src/core/oracle/neuron_hh.json, written by tools/neuron_oracle_hh.py, which
 * says how to regenerate it. Same patch, same protocol, same dt.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams } from "./cell.ts";
import { DEFAULT_SIM, runFamily, runSweep, settle } from "./simulate.ts";
import { detectSpikes, sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { HH } from "./models.ts";

interface Oracle {
  dt: number; settle: number; stepOn: number; stepDur: number; sweep: number;
  sweeps: { celsius: number; hold: number; amp: number; spikes: number[]; vStart: number }[];
}
const oracle = JSON.parse(readFileSync(new URL("./oracle/neuron_hh.json", import.meta.url), "utf8")) as Oracle;
const electrode = { rs: 15, cp: 0, bridge: 1 };
const cellAt = (celsius: number) => buildCell({ ...publishedParams("hh"), knobs: { celsius } });

// Worst spike-time error allowed, ms. Measured 2026-10-29: spike counts
// match exactly on all 21 sweeps (0 to 280 spikes each, at 6.3 and
// 18.5 °C, including depolarization block and anode-break spikes); every
// spike within 0.010 ms, one dt (the port reports the sample at the
// crossing, NEURON's side interpolates it).
const TOL = 0.02;

describe("Hodgkin–Huxley squid axon vs NEURON's hh mechanism", () => {
  const groups = [...new Set(oracle.sweeps.map((s) => `${s.celsius}|${s.hold}`))];
  const sweeps = oracle.sweeps.map(() => null as unknown as ReturnType<typeof runFamily>[number]);
  for (const g of groups) {
    const [celsius, hold] = g.split("|").map(Number);
    const idx = oracle.sweeps.flatMap((s, k) => (`${s.celsius}|${s.hold}` === g ? [k] : []));
    const proto = { sweepMs: oracle.sweep, stepStart: oracle.stepOn, stepDur: oracle.stepDur, amps: idx.map((k) => oracle.sweeps[k].amp) };
    const run = runFamily(
      cellAt(celsius),
      { ihold: hold, electrode, glu: DEFAULT_GLU, gaba: DEFAULT_GABA },
      proto,
      { dt: oracle.dt, sampleMs: oracle.dt, settleMs: oracle.settle, seed: 1 },
    );
    idx.forEach((k, j) => (sweeps[k] = run[j]));
  }

  it("rests where NEURON rests (−65 mV)", () => {
    for (let k = 0; k < sweeps.length; k++) expect(sweeps[k].vm[0]).toBeCloseTo(oracle.sweeps[k].vStart, 2);
  });

  for (let k = 0; k < oracle.sweeps.length; k++) {
    const o = oracle.sweeps[k];
    it(`${o.celsius} °C, ${o.amp} pA: same spike count, every spike within ${TOL} ms`, () => {
      const got = detectSpikes(sweeps[k].vm, sweeps[k].sampleMs).map((s) => s.t);
      expect(got.length).toBe(o.spikes.length);
      for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - o.spikes[i])).toBeLessThan(TOL);
    });
  }
});

describe("the squid axon's numbers the app quotes", () => {
  const cell = cellAt(6.3);
  const inputs = { ihold: 0, electrode, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
  const proto = (amps: number[]) => ({ sweepMs: 1000, stepStart: 100, stepDur: 800, amps });

  it("rests at −65 mV", () => {
    expect(cell.vRest).toBeCloseTo(-65, 1);
  });

  it(`rheobase (800 ms step, bisected to 1 pA) is ModelDef.rheobase, ${HH.rheobase} pA`, () => {
    const st = settle(cell, electrode, 0, HH.settleMs, DEFAULT_SIM.dt);
    const fires = (a: number) => sweepStats(runSweep(cell, inputs, proto([a]), a, st, DEFAULT_SIM, 0), proto([a])).nInStep > 0;
    let lo = 0, hi = 1000;
    while (hi - lo > HH.rheobaseTol) {
      const m = (lo + hi) / 2;
      if (fires(m)) hi = m;
      else lo = m;
    }
    expect(hi).toBeCloseTo(HH.rheobase, -0.5);
  });
});
