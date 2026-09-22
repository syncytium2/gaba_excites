/**
 * The GnRH model against what Adams et al. (2018, J Neurosci 38:1249)
 * report. There is no public code to run as an oracle, so these are the
 * paper's own numbers:
 *
 *  - "I_app … was set to −6 pA to hold the cell at −70 mV" (Methods);
 *  - Fig. 7F, negative-feedback model: spikes during 500 ms steps of
 *    0, 6, 12, 18, 24, 30 pA (on top of I_app) read 0, 0, 0, 1, 4, 6 — read
 *    off the figure by eye, which is exact for integers this small.
 *
 * Measured 2026-09-21: −70.09 mV; 0 0 0 1 4 6. A check against numbers the
 * transcription could have been tuned to, not an independent oracle — the
 * transcription was NOT tuned; these matched on the first run.
 */
import { describe, expect, it } from "vitest";
import { buildCell, cellSteadyV, publishedLeak, publishedRin } from "./cell.ts";
import { GNRH } from "./models.ts";
import { runFamily } from "./simulate.ts";
import { summarize } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

describe("GnRH model (Adams et al. 2018, negative feedback)", () => {
  const cell = buildCell({ model: "gnrh", cm: 20, rin: GNRH.defaults.rin });

  it("the Rin default rebuilds the published 1 nS leak", () => {
    expect(publishedRin("gnrh")).toBeCloseTo(GNRH.defaults.rin, 0);
    expect(cell.gLeak / publishedLeak("gnrh")).toBeCloseTo(1, 3);
  });

  it("−6 pA holds it at −70 mV", () => {
    expect(cellSteadyV(cell, -6)).toBeCloseTo(-70, 0);
  });

  it("fires 0, 0, 0, 1, 4, 6 spikes at 0–30 pA, as in Fig. 7F", () => {
    const proto = { sweepMs: 700, stepStart: 100, stepDur: 500, amps: [0, 6, 12, 18, 24, 30] };
    const sweeps = runFamily(cell, { ihold: -6, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA }, proto);
    expect(summarize(sweeps, proto).stats.map((s) => s.nInStep)).toEqual([0, 0, 0, 1, 4, 6]);
  });
});

describe("E_GABA defaults follow the cell", () => {
  it("GnRH presets carry the measured GABA PSC: 10 ms decay, 1 nS, instantaneous rise (Jaime et al. 2026)", async () => {
    const { PRESETS } = await import("./protocol.ts");
    for (const p of PRESETS.filter((q) => q.model === "gnrh")) {
      expect([p.gaba.tauDecay, p.gaba.gPeak, p.gaba.tauRise]).toEqual([10, 1, 0]);
      expect(p.gaba.enabled).toBe(false);
    }
  });

  it("GnRH presets open on −36.5 mV (DeFazio et al. 2002); pyramidal presets on −80 mV", async () => {
    const { PRESETS } = await import("./protocol.ts");
    for (const p of PRESETS) expect(p.gaba.erev === (p.model === "gnrh" ? -36.5 : p.gaba.erev)).toBe(true);
    for (const p of PRESETS.filter((q) => q.model === "rs" && !["shunt", "crossover", "excites"].includes(q.id))) expect(p.gaba.erev).toBe(-80);
  });
});
