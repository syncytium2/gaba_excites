/**
 * The amplifier's 4-pole Bessel filter, and what it does to a spike. Measured
 * 2026-10-21 on the pyramidal cell's first spike at 700 pA (Vm peak 46.7 mV):
 *
 *   filter     recorded peak   peak delay
 *   bypass     46.7 mV         0
 *   10 kHz     46.7            0.03 ms
 *    5 kHz     46.5            0.06
 *    2 kHz     45.3            0.18
 *    1 kHz     39.2            0.42
 *
 * The spike count, and Vm itself, do not change: the filter is on the record only.
 */
import { describe, expect, it } from "vitest";
import { Bessel4, besselGain, FILTER_KHZ } from "./filter.ts";
import { buildCell, PUBLISHED_RS } from "./cell.ts";
import { runFamily } from "./simulate.ts";
import { detectSpikes } from "./analysis.ts";
import { DEFAULT_NOISE } from "./noise.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

const DT = 0.01;

describe("the 4-pole Bessel filter", () => {
  it("is −3 dB at its cutoff, at every setting", () => {
    for (const fc of FILTER_KHZ.filter((f) => f > 0)) expect(besselGain(fc, DT, fc)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it("passes DC exactly, starts settled, and barely overshoots a step (a Bessel's virtue)", () => {
    const f = new Bessel4(1, DT);
    f.reset(-70);
    for (let i = 0; i < 100; i++) expect(f.next(-70)).toBeCloseTo(-70, 9);
    let peak = -Infinity, last = 0;
    for (let i = 0; i < 20000; i++) {
      last = f.next(-60);
      peak = Math.max(peak, last);
    }
    expect(last).toBeCloseTo(-60, 9);
    expect((peak + 60) / 10).toBeLessThan(0.015); // under 1.5 % of the step
  });
});

describe("what the filter does to a spike", () => {
  const cell = buildCell(PUBLISHED_RS);
  const run = (recFilter: (typeof FILTER_KHZ)[number]) =>
    runFamily(cell, { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA, noise: { ...DEFAULT_NOISE, recFilter } },
      { sweepMs: 400, stepStart: 100, stepDur: 300, amps: [700] }, { dt: DT, sampleMs: 0.03, seed: 1 })[0];
  const peakOf = (w: ReturnType<typeof run>, v: Float32Array) => {
    const k0 = Math.round(detectSpikes(w.vm, w.sampleMs)[0].t / w.sampleMs);
    let pk = -Infinity, at = 0;
    for (let i = k0 - 100; i < k0 + 200; i++) if (v[i] > pk) { pk = v[i]; at = i * w.sampleMs; }
    return { pk, at };
  };
  const bypass = run(0);
  const truePeak = peakOf(bypass, bypass.vm);

  it("leaves Vm, and so every measurement, untouched", () => {
    for (const f of [10, 1] as const) {
      const w = run(f);
      expect(Array.from(w.vm)).toEqual(Array.from(bypass.vm));
      expect(detectSpikes(w.vm, w.sampleMs).length).toBe(3);
    }
  });

  it("at 10 kHz the recorded spike is the true one, give or take 0.1 mV; at 1 kHz it peaks 7.5 mV low and 0.4 ms late", () => {
    const at10 = peakOf(run(10), run(10).vRec);
    expect(Math.abs(at10.pk - truePeak.pk)).toBeLessThan(0.1);
    const w1 = run(1);
    const at1 = peakOf(w1, w1.vRec);
    expect(truePeak.pk - at1.pk).toBeCloseTo(7.5, 0);
    expect(at1.at - truePeak.at).toBeCloseTo(0.42, 1);
    const w2 = run(2);
    expect(truePeak.pk - peakOf(w2, w2.vRec).pk).toBeCloseTo(1.4, 0);
  });
});
