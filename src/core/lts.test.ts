/**
 * The LTS cell's numbers that the presets, README and methods page quote,
 * pinned so that a change to the model or the integrator cannot move them
 * quietly. oracle.test.ts holds the same cell to NEURON's spike times; this
 * file holds the claims. Measured 2026-10-21:
 *
 *   rest −83.95 mV, Rin 446.2 MΩ at rest; 60 pA holds it at −63.95 mV
 *   rheobase, 800 ms step from rest, bisected to 1 pA: 39 pA
 *   from rest: 100 pA → a pair 25 ms apart; 150 pA → a pair, then 4 spikes ~200 ms apart
 *   held at 60 pA, 500 ms steps, spikes after release:
 *       −25 pA (to −70 mV) 0 · −50 pA (to −80 mV) 1, 88 ms after · −75 pA (to −90 mV) 2 · −100 pA (to −99 mV) 2
 *   from rest, 500 ms steps of −10 to −30 pA (to −95 mV): 0 after release
 *   (larger steps from rest go below E_K, where the siren sounds: extremes.test.ts)
 */
import { describe, expect, it } from "vitest";
import { buildCell, cellSteadyV, publishedParams } from "./cell.ts";
import { DEFAULT_SIM, runSweep, settle } from "./simulate.ts";
import { detectSpikes, sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { MODELS } from "./models.ts";
import { PRESETS } from "./protocol.ts";

const E = { rs: 15, cp: 0, bridge: 1 };
const inputs = (ihold: number) => ({ ihold, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA });
const lts = buildCell(publishedParams("lts"));

/** spike times of one sweep, ms */
function spikes(ihold: number, proto: { sweepMs: number; stepStart: number; stepDur: number }, amp: number): number[] {
  const st = settle(lts, E, ihold, MODELS.lts.settleMs, DEFAULT_SIM.dt);
  const w = runSweep(lts, inputs(ihold), { ...proto, amps: [amp] }, amp, st, DEFAULT_SIM, 0);
  return detectSpikes(w.vm, w.sampleMs).map((s) => s.t);
}

describe("LTS pyramidal cell (Pospischil 2008 sPYr_template, demo_PY_LTS.hoc)", () => {
  it("rests at −84 mV with Rin 446 MΩ; 60 pA holds it at −64 mV", () => {
    expect(lts.vRest).toBeCloseTo(-83.95, 2);
    expect(lts.rinRest).toBeCloseTo(446.2, 1);
    expect(cellSteadyV(lts, 60)).toBeCloseTo(-63.95, 2);
  });

  it("rheobase from rest is 39 pA, as models.ts declares", () => {
    const st = settle(lts, E, 0, MODELS.lts.settleMs, DEFAULT_SIM.dt);
    const p = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [0] };
    const fires = (a: number) => sweepStats(runSweep(lts, inputs(0), p, a, st, DEFAULT_SIM, 0), p).nInStep > 0;
    let lo = 0, hi = 200;
    while (hi - lo > 1) {
      const m = (lo + hi) / 2;
      if (fires(m)) hi = m;
      else lo = m;
    }
    expect(Math.abs(hi - 39)).toBeLessThanOrEqual(1);
    expect(MODELS.lts.rheobase).toBe(39);
  });

  it("bursts from rest: 100 pA a pair 25 ms apart; 150 pA a pair, then spikes ~200 ms apart", () => {
    const p = { sweepMs: 1000, stepStart: 100, stepDur: 800 };
    const at100 = spikes(0, p, 100);
    expect(at100.length).toBe(2);
    expect(at100[1] - at100[0]).toBeCloseTo(25, 0);
    const at150 = spikes(0, p, 150);
    expect(at150.length).toBe(6);
    expect(at150[1] - at150[0]).toBeLessThan(20);
    for (let i = 3; i < at150.length; i++) expect(at150[i] - at150[i - 1]).toBeGreaterThan(190);
  });

  const reb = { sweepMs: 1500, stepStart: 200, stepDur: 500 };
  const release = reb.stepStart + reb.stepDur;

  it("held at −64 mV, it fires on release from hyperpolarization, never during it", () => {
    const after = (amp: number) => spikes(60, reb, amp).filter((t) => t >= release);
    for (const amp of [0, -25, -50, -75, -100]) expect(spikes(60, reb, amp).filter((t) => t < release)).toEqual([]);
    expect(after(0)).toEqual([]);
    expect(after(-25)).toEqual([]);
    const one = after(-50);
    expect(one.length).toBe(1);
    expect(one[0] - release).toBeCloseTo(88, 0);
    expect(after(-75).length).toBe(2);
    expect(after(-100).length).toBe(2);
  });

  it("from its own rest, release from −95 mV fires nothing", () => {
    expect(cellSteadyV(lts, -30)).toBeCloseTo(-95.3, 1);
    for (const amp of [-10, -20, -30]) expect(spikes(0, reb, amp)).toEqual([]);
  });

  it("its presets use these protocols and belong to it", () => {
    const mine = PRESETS.filter((p) => p.model === "lts");
    expect(mine.map((p) => p.id)).toEqual(["lts-rebound", "lts-rebound-rest", "lts-burst"]);
    const r = mine[0];
    expect(r.ihold).toBe(60);
    expect([r.protocol.sweepMs, r.protocol.stepStart, r.protocol.stepDur]).toEqual([reb.sweepMs, reb.stepStart, reb.stepDur]);
    expect(r.protocol.list).toBe("0, -25, -50, -75, -100");
    expect(mine[1].ihold).toBe(0);
    expect(mine[1].protocol.list).toBe("0, -10, -20, -30");
    expect([mine[1].protocol.sweepMs, mine[1].protocol.stepStart, mine[1].protocol.stepDur]).toEqual([reb.sweepMs, reb.stepStart, reb.stepDur]);
  });
});
