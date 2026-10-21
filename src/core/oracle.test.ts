/**
 * The ports against NEURON running ModelDB 123623's own .mod files, one
 * reference per cell: src/core/oracle/neuron_<cell>.json, written by
 * tools/neuron_oracle.py, which says how to regenerate them. Same cell, same
 * protocol, same dt, same scheme.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams } from "./cell.ts";
import { runFamily } from "./simulate.ts";
import { detectSpikes } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

interface Oracle {
  dt: number; settle: number; stepOn: number; stepDur: number; sweep: number;
  /** `hold`, where present, is the sweep's holding current in pA (lts); otherwise 0 */
  sweeps: { hold?: number; amp: number; spikes: number[]; vStart: number }[];
}

// Worst spike-time error allowed, ms. Measured, with the reasons, beside each.
const CELLS = [
  // Measured 2026-09-21: worst case 0.20 ms, the fifth spike of the 700 pA
  // sweep at 491 ms, after a long near-threshold interval that magnifies any
  // difference. Every other spike is within 0.09 ms. Spike COUNTS match exactly.
  { id: "rs", label: "pyramidal (sPY_template)", tol: 0.25 },
  // Measured 2026-10-15: spike counts match exactly on every sweep (526 spikes,
  // up to 298 Hz); worst 0.015 ms, the last spike of the 400 pA sweep at 896 ms,
  // the slowest train; every other spike within 0.01 ms.
  { id: "fs", label: "fast-spiking (sIN_template)", tol: 0.05 },
  // Measured 2026-10-21: spike counts match exactly on all 12 sweeps — the
  // bursts from its own rest and the rebounds after release from
  // hyperpolarization at four holding currents; every spike within 0.010 ms,
  // one dt (the port reports the sample at the crossing, NEURON's side
  // interpolates it).
  { id: "lts", label: "low-threshold spike (sPYr_template, demo_PY_LTS.hoc)", tol: 0.02 },
] as const;

for (const c of CELLS) {
  const oracle = JSON.parse(readFileSync(new URL(`./oracle/neuron_${c.id}.json`, import.meta.url), "utf8")) as Oracle;
  describe(`port vs NEURON (ModelDB 123623 mechanisms): ${c.label}`, () => {
    const cell = buildCell(publishedParams(c.id));
    // one family per holding current, each settled at its own hold, as NEURON's side is
    const holds = [...new Set(oracle.sweeps.map((s) => s.hold ?? 0))];
    const sweeps = oracle.sweeps.map(() => null as unknown as ReturnType<typeof runFamily>[number]);
    for (const hold of holds) {
      const idx = oracle.sweeps.flatMap((s, k) => ((s.hold ?? 0) === hold ? [k] : []));
      const proto = { sweepMs: oracle.sweep, stepStart: oracle.stepOn, stepDur: oracle.stepDur, amps: idx.map((k) => oracle.sweeps[k].amp) };
      const run = runFamily(
        cell,
        { ihold: hold, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA },
        proto,
        { dt: oracle.dt, sampleMs: oracle.dt, settleMs: oracle.settle, seed: 1 },
      );
      idx.forEach((k, j) => (sweeps[k] = run[j]));
    }

    it("rests where NEURON rests", () => {
      for (let k = 0; k < sweeps.length; k++) expect(sweeps[k].vm[0]).toBeCloseTo(oracle.sweeps[k].vStart, 2);
    });

    for (let k = 0; k < oracle.sweeps.length; k++) {
      const o = oracle.sweeps[k];
      it(`${o.hold ? `held at ${o.hold} pA, ` : ""}${o.amp} pA: same spike count, every spike within ${c.tol} ms`, () => {
        const got = detectSpikes(sweeps[k].vm, sweeps[k].sampleMs).map((s) => s.t);
        expect(got.length).toBe(o.spikes.length);
        for (let i = 0; i < got.length; i++) expect(Math.abs(got[i] - o.spikes[i])).toBeLessThan(c.tol);
      });
    }
  });
}
