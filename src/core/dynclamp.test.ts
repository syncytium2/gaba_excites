/**
 * Dynamic clamp (dynclamp.ts, CellParams.inject): an injected conductance is felt by rest, input resistance
 * and firing like any channel; a negative one subtracts; and a voltage-gated conductance open at rest is, at
 * rest, a leak that its linearization reproduces.
 */
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams } from "./cell.ts";
import { KV4, kv4Injection, kv4PeakFraction, kv4Window, leakInjection, linearizedAt, makeMendoncaKv4, opposite } from "./dynclamp.ts";
import { KNDY_OVX } from "./kndy.ts";
import { runFamily } from "./simulate.ts";
import { detectSpikes } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

const P = { model: KNDY_OVX.id, cm: KNDY_OVX.defaults.cm, gLeak: KNDY_OVX.defaults.gLeak };
const host = (inject = [] as ReturnType<typeof kv4Injection>[]) => buildCell({ ...P, inject }, KNDY_OVX);

describe("Mendonça's Kv4, as their papers write it", () => {
  it("has the published steady states and time constants", () => {
    expect(KV4.mInf(-30)).toBeCloseTo(0.5, 12);
    expect(KV4.hInf(-55.1)).toBeCloseTo(0.5, 12);
    expect(KV4.mInf(0)).toBeCloseTo(1 / (1 + Math.exp(-3)), 12);
    expect(KV4.tauM(0)).toBeCloseTo(0.346 + 2.09, 12);
    expect(KV4.tauH(0)).toBeCloseTo(2.1 + 4.627, 12);
    expect(KV4.tauH(-70)).toBeCloseTo(2.1 * Math.exp(70 / 21.2) + 4.627, 12);
  });

  it("is partly open at rest: 1.4% of ḡ at −70 mV, 2.9% at −60, 4.7% at −50", () => {
    expect(kv4Window(-70)).toBeCloseTo(0.0142, 4);
    expect(kv4Window(-60)).toBeCloseTo(0.0287, 4);
    expect(kv4Window(-50)).toBeCloseTo(0.0465, 4);
  });

  it("the dose is the peak at 0 mV: 41.6% of ḡ on a step from −90 mV", () => {
    expect(kv4PeakFraction()).toBeCloseTo(0.416, 3);
    const inj = kv4Injection(2.18);
    expect(inj.g).toBeCloseTo(2.18 / kv4PeakFraction(), 12);
    expect(inj.erev).toBe(-90);
    // and it is what a voltage clamp would measure: the channel's own gates, stepped
    const ch = makeMendoncaKv4();
    const s = new Float64Array(2);
    ch.init(-90, s, 0);
    let peak = 0;
    for (let i = 0; i < 5000; i++) {
      ch.advance(0, 0.01, s, 0);
      peak = Math.max(peak, ch.open(s, 0, 0));
    }
    expect(peak).toBeCloseTo(kv4PeakFraction(), 3);
  });
});

describe("an injected conductance belongs to the rig, not the cell", () => {
  it("joins the channels after the model's own, unscaled by Cm, and carries no calcium", () => {
    const inj = kv4Injection(5);
    const c = buildCell({ ...P, cm: 2 * P.cm, inject: [inj] }, KNDY_OVX);
    expect(c.nOwn).toBe(KNDY_OVX.channels().length);
    expect(c.channels.length).toBe(c.nOwn + 1);
    expect(c.gbar[c.nOwn]).toBe(inj.g);
    expect(c.carriesCa[c.nOwn]).toBe(false);
    expect(c.caFrac[c.nOwn]).toBe(0);
    expect(c.gbar[0]).toBeCloseTo(2 * host().gbar[0], 12);
  });

  it("adding and subtracting the same conductance leaves the cell exactly as it was", () => {
    const a = kv4Injection(8);
    const both = host([a, { ...kv4Injection(-8), channel: makeMendoncaKv4() }]);
    const c0 = host();
    expect(both.vRest).toBeCloseTo(c0.vRest, 9);
    expect(both.rinRest).toBeCloseTo(c0.rinRest, 6);
  });

  it("works on any model: a K⁺ leak added to the pyramidal cell lowers its input resistance and its rest", () => {
    const p = publishedParams("rs");
    const c0 = buildCell(p);
    const c = buildCell({ ...p, inject: [leakInjection(10, -100)] });
    // 8.7 nS, not 10: the leak also moves rest down, which closes some of the M current
    const added = 1000 / c.rinRest - 1000 / c0.rinRest;
    expect(added).toBeGreaterThan(8);
    expect(added).toBeLessThan(10);
    expect(c.vRest).toBeLessThan(c0.vRest);
    // and firing feels it: the published cell's rheobase step no longer fires
    const inp = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
    const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [600] };
    expect(detectSpikes(runFamily(c0, inp, proto)[0].vm, 0.025).length).toBeGreaterThan(0);
    expect(detectSpikes(runFamily(c, inp, proto)[0].vm, 0.025).length).toBe(0);
  });
});

describe("a voltage-gated conductance open at rest is a leak", () => {
  const c0 = host();
  // +0.4 nS/pF of peak conductance at 0 mV, inside the range of Mendonça 2018 Fig. 6E
  const inj = kv4Injection(0.4 * P.cm);
  const kv4 = host([inj]);

  it("adding Kv4 hyperpolarizes the KNDy cell by 2.5 mV and takes its input resistance from 414 to 239 MΩ", () => {
    expect(c0.vRest).toBeCloseTo(-66.36, 2);
    expect(c0.rinRest).toBeCloseTo(414.4, 0);
    expect(kv4.vRest).toBeCloseTo(-68.89, 2);
    expect(kv4.rinRest).toBeCloseTo(239, 0);
  });

  it("its linearization at rest, a plain leak, gives the same rest and the same input resistance", () => {
    const lin = linearizedAt(inj, kv4.vRest);
    const c = host([lin.slope]);
    expect(c.vRest).toBeCloseTo(kv4.vRest, 2);
    expect(Math.abs(c.rinRest / kv4.rinRest - 1)).toBeLessThan(0.005);
    // the slope a small step sees is 2.6 times the conductance that is open
    expect(lin.chord.g).toBeCloseTo(0.344, 3);
    expect(lin.slope.g).toBeCloseTo(0.909, 3);
    // the open conductance alone, at E_K, gets rest right and input resistance wrong
    const chord = host([lin.chord]);
    expect(chord.vRest).toBeCloseTo(kv4.vRest, 2);
    expect(chord.rinRest).toBeGreaterThan(kv4.rinRest * 1.1);
  });

  it("Kv4 with its linearization subtracted leaves rest and input resistance untouched", () => {
    const c = host([inj, opposite(linearizedAt(inj, c0.vRest).slope)]);
    expect(c.vRest).toBeCloseTo(c0.vRest, 6);
    expect(Math.abs(c.rinRest / c0.rinRest - 1)).toBeLessThan(1e-4);
  });
});
