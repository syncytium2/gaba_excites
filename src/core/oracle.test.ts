/**
 * The port against NEURON running ModelDB 123623's own .mod files.
 * src/core/oracle/neuron_rs.json is written by tools/neuron_oracle.py, which
 * says how to regenerate it. Same cell, same protocol, same dt, same scheme.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCell, PUBLISHED_RS } from "./cell.ts";
import { runFamily } from "./simulate.ts";
import { detectSpikes } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

const oracle = JSON.parse(readFileSync(new URL("./oracle/neuron_rs.json", import.meta.url), "utf8")) as {
  dt: number; settle: number; stepOn: number; stepDur: number; sweep: number;
  sweeps: { amp: number; spikes: number[]; vStart: number }[];
};

describe("port vs NEURON (ModelDB 123623 mechanisms)", () => {
  const cell = buildCell(PUBLISHED_RS);
  const proto = { sweepMs: oracle.sweep, stepStart: oracle.stepOn, stepDur: oracle.stepDur, amps: oracle.sweeps.map((s) => s.amp) };
  const sweeps = runFamily(
    cell,
    { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA },
    proto,
    { dt: oracle.dt, sampleMs: oracle.dt, settleMs: oracle.settle, seed: 1 },
  );

  it("rests where NEURON rests", () => {
    for (let k = 0; k < sweeps.length; k++) expect(sweeps[k].vm[0]).toBeCloseTo(oracle.sweeps[k].vStart, 2);
  });

  for (let k = 0; k < oracle.sweeps.length; k++) {
    const o = oracle.sweeps[k];
    // Measured 2026-09-21: worst case 0.20 ms, the fifth spike of the 700 pA
    // sweep at 491 ms, after a long near-threshold interval that magnifies any
    // difference. Every other spike is within 0.09 ms. Spike COUNTS match exactly.
    it(`${o.amp} pA: same spike count, every spike within 0.25 ms`, () => {
      const got = detectSpikes(sweeps[k].vm, sweeps[k].sampleMs).map((s) => s.t);
      expect(got.length).toBe(o.spikes.length);
      for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - o.spikes[i])).toBeLessThan(0.25);
    });
  }
});
