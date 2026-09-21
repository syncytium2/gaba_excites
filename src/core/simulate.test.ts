import { describe, expect, it } from "vitest";
import { buildCell, PUBLISHED_RS } from "./cell.ts";
import { runFamily, type Inputs, type SimOptions } from "./simulate.ts";
import { detectSpikes, summarize } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU, eventTimes, kinetics } from "./synapses.ts";

const cell = buildCell(PUBLISHED_RS);
const fast: SimOptions = { dt: 0.01, sampleMs: 0.05, settleMs: 1500, seed: 3 };
const base: Inputs = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
const proto = { sweepMs: 400, stepStart: 50, stepDur: 300, amps: [-100, 0, 900] };

describe("electrode", () => {
  it("with Cp = 0, Rs changes nothing about Vm", () => {
    const a = runFamily(cell, base, proto, fast);
    const b = runFamily(cell, { ...base, electrode: { rs: 60, cp: 0, bridge: 0 } }, proto, fast);
    for (let k = 0; k < a.length; k++) expect(Array.from(b[k].vm)).toEqual(Array.from(a[k].vm));
  });

  it("an unbalanced bridge offsets the record by I·Rs, and balancing removes it", () => {
    const rs = 40;
    const [sw] = runFamily(cell, { ...base, electrode: { rs, cp: 0, bridge: 0 } }, { ...proto, amps: [-100] }, fast);
    const i = Math.round(200 / sw.sampleMs);
    expect(sw.vRec[i] - sw.vm[i]).toBeCloseTo(-100 * rs * 1e-3, 3);
    const [bal] = runFamily(cell, { ...base, electrode: { rs, cp: 0, bridge: 1 } }, { ...proto, amps: [-100] }, fast);
    expect(bal.vRec[i] - bal.vm[i]).toBeCloseTo(0, 4);
  });

  it("pipette capacitance filters the recorded spike but not Vm's", () => {
    const [a] = runFamily(cell, base, { ...proto, amps: [900] }, fast);
    const [b] = runFamily(cell, { ...base, electrode: { rs: 30, cp: 8, bridge: 1 } }, { ...proto, amps: [900] }, fast);
    const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, v), -Infinity);
    expect(peak(b.vRec)).toBeLessThan(peak(b.vm) - 5);
    expect(Math.abs(peak(b.vm) - peak(a.vm))).toBeLessThan(2);
  });
});

describe("synapses", () => {
  it("one event peaks at exactly gPeak", () => {
    const s = { ...DEFAULT_GABA, enabled: true, gPeak: 4, tauRise: 0.7, tauDecay: 9 };
    const k = kinetics(s, 0.001);
    let a = k.jump, b = k.jump, max = 0;
    for (let i = 0; i < 20000; i++) {
      a *= k.decayA;
      b *= k.decayB;
      max = Math.max(max, a - b);
    }
    expect(max).toBeCloseTo(4, 3);
  });

  it("Poisson trains have the requested rate and are reproducible", () => {
    const s = { ...DEFAULT_GLU, enabled: true, rate: 40 };
    const t = eventTimes(s, 100000, 11);
    expect(t.length / 100).toBeGreaterThan(38);
    expect(t.length / 100).toBeLessThan(42);
    expect(eventTimes(s, 100000, 11)).toEqual(t);
  });

  it("GABA reversing at rest moves nothing: pure shunt", () => {
    const gaba = { ...DEFAULT_GABA, enabled: true, rate: 100, gPeak: 10, erev: cell.vRest };
    const [sw] = runFamily(cell, { ...base, gaba }, { ...proto, amps: [0] }, fast);
    for (const v of sw.vm) expect(Math.abs(v - cell.vRest)).toBeLessThan(1e-3);
  });

  it("GABA at −80 mV cuts firing; depolarizing GABA raises it", () => {
    const p = { ...proto, amps: [800] };
    const n = (g: typeof DEFAULT_GABA) =>
      detectSpikes(runFamily(cell, { ...base, gaba: g }, p, fast)[0].vm, 0.05).length;
    const none = n(DEFAULT_GABA);
    const hyper = n({ ...DEFAULT_GABA, enabled: true, rate: 100, gPeak: 5, erev: -80 });
    const depol = n({ ...DEFAULT_GABA, enabled: true, rate: 100, gPeak: 5, erev: -30 });
    expect(hyper).toBeLessThan(none);
    expect(depol).toBeGreaterThan(none);
  });
});

describe("analysis", () => {
  it("finds rheobase, threshold, and Rin on the published cell", () => {
    const pr = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [-200, -100, 0, 500, 550, 600, 700] };
    const s = summarize(runFamily(cell, base, pr, { ...fast, settleMs: 3000 }), pr);
    expect(s.rheobase).toBe(600); // NEURON: 550 pA silent, 600 pA one spike
    expect(s.threshold).toBeGreaterThan(-45);
    expect(s.threshold).toBeLessThan(-35);
    expect(s.rinMeasured).toBeGreaterThan(30);
    expect(s.rinMeasured).toBeLessThan(35);
  });
});
