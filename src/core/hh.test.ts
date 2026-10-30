/**
 * The Hodgkin–Huxley squid axon against NEURON's built-in hh mechanism:
 * src/core/oracle/neuron_hh.json, written by tools/neuron_oracle_hh.py, which
 * says how to regenerate it. Same patch, same protocol, same dt.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCell, cellSteadyV, publishedParams } from "./cell.ts";
import { DEFAULT_SIM, runFamily, runSweep, settle } from "./simulate.ts";
import { detectSpikes, sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { HH } from "./models.ts";
import { DEFAULT_NOISE } from "./noise.ts";
import { VC_PRESETS, vcPresetsFor } from "./protocol.ts";
import { measureSweep, runVCFamily } from "./vclamp.ts";

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

// ---------------------------------------------------------------- against the paper
//
// Hodgkin & Huxley (1952) J Physiol 117:500–544, read 2026-10-29. The paper writes V as the displacement from rest
// with depolarization NEGATIVE; the port's Vm = −(V + 65). lit/notes/hodgkin1952.md has the transcription.

/** the paper's rate functions, in its own sign convention (p. 519, Eqs. 12, 13, 20, 21, 23, 24), at 6.3 °C */
const paper = {
  // at V = −10 and V = −25 the printed forms are 0/0; their limits are 0.1 and 1
  an: (V: number) => (Math.abs(V + 10) < 1e-9 ? 0.1 : (0.01 * (V + 10)) / (Math.exp((V + 10) / 10) - 1)),
  bn: (V: number) => 0.125 * Math.exp(V / 80),
  am: (V: number) => (Math.abs(V + 25) < 1e-9 ? 1 : (0.1 * (V + 25)) / (Math.exp((V + 25) / 10) - 1)),
  bm: (V: number) => 4 * Math.exp(V / 18),
  ah: (V: number) => 0.07 * Math.exp(V / 20),
  bh: (V: number) => 1 / (Math.exp((V + 30) / 10) + 1),
};

describe("the squid axon against Hodgkin & Huxley 1952: the equations", () => {
  it("steady states m∞, h∞, n∞ match the paper's rate functions at every voltage (Eqs. 9, 22, 25)", () => {
    const na = HH.channels({ celsius: 6.3 })[0].channel;
    const k = HH.channels({ celsius: 6.3 })[1].channel;
    const s = new Float64Array(3);
    for (let vm = -120; vm <= 40; vm += 7.3) {
      const V = -(vm + 65);
      na.init(vm, s, 0);
      k.init(vm, s, 2);
      expect(s[0]).toBeCloseTo(paper.am(V) / (paper.am(V) + paper.bm(V)), 12);
      expect(s[1]).toBeCloseTo(paper.ah(V) / (paper.ah(V) + paper.bh(V)), 12);
      expect(s[2]).toBeCloseTo(paper.an(V) / (paper.an(V) + paper.bn(V)), 12);
    }
  });

  it("time constants match: one step relaxes each gate by exp(−dt·(α + β)·φ), φ = 3^((T − 6.3)/10) (p. 519)", () => {
    for (const celsius of [6.3, 18.5]) {
      const phi = Math.pow(3, (celsius - 6.3) / 10);
      const [na, k] = HH.channels({ celsius }).map((c) => c.channel);
      const vm = -30, V = -(vm + 65), dt = 0.05;
      const s = new Float64Array([0, 1, 0]);
      na.advance(vm, dt, s, 0);
      k.advance(vm, dt, s, 2);
      const step = (x0: number, a: number, b: number) => a / (a + b) + (x0 - a / (a + b)) * Math.exp(-dt * phi * (a + b));
      expect(s[0]).toBeCloseTo(step(0, paper.am(V), paper.bm(V)), 12);
      expect(s[1]).toBeCloseTo(step(1, paper.ah(V), paper.bh(V)), 12);
      expect(s[2]).toBeCloseTo(step(0, paper.an(V), paper.bn(V)), 12);
    }
  });

  it("Table 3's constants: ḡNa 120, ḡK 36, ḡl 0.3 mS/cm², C 1 µF/cm², V_Na −115, V_K +12, V_l −10.613 mV", () => {
    const [na, k] = HH.channels({ celsius: 6.3 });
    // 100 pF patch: mS/cm² × 100 = nS
    expect(na.gbar).toBe(12000);
    expect(k.gbar).toBe(3600);
    expect(HH.defaults.gLeak).toBeCloseTo(30, 12);
    expect(HH.defaults.cm).toBe(100);
    // the paper's potentials are displacements from rest, depolarization negative: E = −V − 65
    expect(na.erev).toBe(-(-115) - 65);
    expect(k.erev).toBe(-12 - 65);
    expect(HH.eLeak).toBeCloseTo(-(-10.613) - 65, 12);
  });
});

/**
 * A membrane action potential as the paper computes it (p. 522): the membrane displaced at t = 0 with the gates at
 * rest, then left alone. Here, a one-step pulse carrying the charge (ΔV × 100 pF), or for anode break (p. 536)
 * release from the steady state 30 mV below rest. Measured as Table 4 measures it.
 */
function membraneAP(celsius: number, how: { shock: number } | { anodeBreak: number }, dt: number) {
  const cell = cellAt(celsius);
  const inputs = (ihold: number) => ({ ihold, electrode, glu: DEFAULT_GLU, gaba: DEFAULT_GABA });
  const sim = { ...DEFAULT_SIM, dt, sampleMs: dt };
  let ihold = 0;
  if ("anodeBreak" in how) {
    let lo = -5000, hi = 0;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (cellSteadyV(cell, m) > -65 - how.anodeBreak) hi = m; else lo = m; }
    ihold = (lo + hi) / 2;
  }
  const amp = "shock" in how ? (how.shock * 100) / dt : -ihold;
  const proto = { sweepMs: 60, stepStart: 1, stepDur: "shock" in how ? dt : 59, amps: [amp] };
  const st = settle(cell, electrode, ihold, 1000, dt);
  const vm = runSweep(cell, inputs(ihold), proto, amp, st, sim, 0).vm;
  const rest = -65; // Table 4 measures from the resting potential
  const i0 = Math.round(1 / dt) + 1;
  let ip = i0;
  for (let i = i0; i < vm.length; i++) if (vm[i] > vm[ip]) ip = i;
  let maxRise = 0;
  for (let i = i0 + 1; i <= ip; i++) maxRise = Math.max(maxRise, (vm[i] - vm[i - 1]) / dt);
  let i20 = i0;
  while (i20 < ip && vm[i20] - rest < 20) i20++;
  let iDown = ip;
  while (iDown < vm.length && vm[iDown] > rest) iDown++;
  let iMin = iDown;
  for (let i = iDown; i < vm.length; i++) if (vm[i] < vm[iMin]) iMin = i;
  let iBack = iMin;
  while (iBack < vm.length && vm[iBack] < rest) iBack++;
  return {
    height: vm[ip] - rest, positive: rest - vm[iMin], rise: (ip - i20) * dt, fall: (iDown - ip) * dt,
    positiveDur: (iBack - iDown) * dt, maxRise,
  };
}

/**
 * Table 4 (p. 527), "Characteristics of calculated action potentials", the membrane rows: spike height, amplitude
 * of the positive phase (the undershoot below rest), rising phase from 20 mV to the peak, falling phase from the
 * peak to rest, duration of the positive phase, maximum rate of rise. NaN where the paper gives a dash.
 */
const TABLE4 = [
  { label: "6.3 °C, 15 mV depolarization", celsius: 6.3, how: { shock: 15 }, height: 105.4, positive: 11.2, rise: 0.59, fall: 2.21, positiveDur: 14.15, maxRise: 311 },
  { label: "6.3 °C, 7 mV depolarization", celsius: 6.3, how: { shock: 7 }, height: 102.1, positive: NaN, rise: 0.62, fall: NaN, positiveDur: NaN, maxRise: 277 },
  { label: "6.3 °C, 90 mV depolarization", celsius: 6.3, how: { shock: 90 }, height: 108.5, positive: NaN, rise: NaN, fall: NaN, positiveDur: NaN, maxRise: NaN },
  { label: "6.3 °C, 100 mV depolarization", celsius: 6.3, how: { shock: 100 }, height: 108.8, positive: NaN, rise: NaN, fall: NaN, positiveDur: NaN, maxRise: NaN },
  { label: "18.5 °C, 15 mV depolarization", celsius: 18.5, how: { shock: 15 }, height: 96.8, positive: 10.5, rise: 0.275, fall: 0.61, positiveDur: 5.09, maxRise: 564 },
  { label: "6.3 °C, anode break", celsius: 6.3, how: { anodeBreak: 30 }, height: 112.1, positive: 11.2, rise: 0.50, fall: 2.54, positiveDur: 14.4, maxRise: 414 },
] as const;

describe("the squid axon against Hodgkin & Huxley 1952: Table 4's membrane action potentials", () => {
  // At dt = 0.001 ms the port reproduces every number the table prints, to within the table's own rounding plus
  // the tolerances below. Measured 2026-10-29: heights within 0.06 mV, positive phase within 0.05 mV, rising and
  // falling phases within 0.007 ms, positive-phase duration within 0.08 ms (0.6%), maximum rate of rise within 4 V/s.
  for (const r of TABLE4) {
    it(`${r.label}: as printed`, () => {
      const m = membraneAP(r.celsius, r.how, 0.001);
      const near = (got: number, want: number, tol: number) => { if (Number.isFinite(want)) expect(Math.abs(got - want)).toBeLessThanOrEqual(tol); };
      near(m.height, r.height, 0.15);
      near(m.positive, r.positive, 0.1);
      near(m.rise, r.rise, 0.01);
      near(m.fall, r.fall, 0.01);
      near(m.positiveDur, r.positiveDur, 0.01 * r.positiveDur);
      near(m.maxRise, r.maxRise, 0.015 * r.maxRise);
    });
  }

  // The app integrates at dt = 0.01 ms, where the fastest numbers come out a little low. Measured 2026-10-29:
  // spike heights within 0.9 mV of the table (18.5 °C is the worst, 96.0 against 96.8) and the maximum rate of
  // rise 3–6% low (530 against 564 V/s at 18.5 °C). methods.html quotes these.
  it("at the app's own dt (0.01 ms): heights within 0.9 mV, maximum rate of rise within 7% low", () => {
    for (const r of TABLE4) {
      const m = membraneAP(r.celsius, r.how, DEFAULT_SIM.dt);
      expect(Math.abs(m.height - r.height)).toBeLessThan(0.9);
      if (Number.isFinite(r.maxRise)) {
        expect(m.maxRise).toBeLessThan(r.maxRise);
        expect(m.maxRise).toBeGreaterThan(0.93 * r.maxRise);
      }
    }
  });

  it("Fig. 12 (p. 525): at 6 °C a 7 mV depolarization fires and 6 mV does not, at both dt", () => {
    for (const dt of [0.001, DEFAULT_SIM.dt]) {
      expect(membraneAP(6.3, { shock: 6 }, dt).height).toBeLessThan(10);
      expect(membraneAP(6.3, { shock: 7 }, dt).height).toBeGreaterThan(100);
    }
  });
});

// The numbers the squid axon's presets quote (protocol.ts: hh-temp, hh-anode), at the app's own dt. The spike
// counts they quote are the NEURON oracle's, held exactly above.
describe("the squid axon's presets: what they quote from Table 4, as the app computes it", () => {
  it("a spike falls from peak to rest as in Table 4 (2.21 ms at 6.3 °C, 0.61 at 18.5 °C) to within 0.01 ms", () => {
    expect(Math.abs(membraneAP(6.3, { shock: 15 }, DEFAULT_SIM.dt).fall - 2.21)).toBeLessThanOrEqual(0.0101);
    expect(Math.abs(membraneAP(18.5, { shock: 15 }, DEFAULT_SIM.dt).fall - 0.61)).toBeLessThanOrEqual(0.0101);
  });
  it("anode break from 30 mV below rest gives a spike 112.0 mV high (Table 4: 112.1)", () => {
    expect(membraneAP(6.3, { anodeBreak: 30 }, DEFAULT_SIM.dt).height).toBeCloseTo(112.0, 1);
  });
});

// Voltage clamp on the squid axon, against the paper's own solution for a clamped step (Eqs. 8, 17 and 18, pp. 507
// and 512): at fixed V each gate relaxes exponentially from its resting value, so I_K = ḡK n(t)⁴ (V − E_K) and
// I_Na = ḡNa m(t)³ h(t) (V − E_Na) are known exactly. The presets that reproduce Figs. 3 and 6, run as a user would
// with the other channel blocked, must measure what those equations give.
describe("the squid axon's voltage-clamp presets against the paper's clamped-step solution", () => {
  const exact = (vm: number, t: number) => {
    const V = -(vm + 65), V0 = 0;
    const relax = (a: (v: number) => number, b: (v: number) => number) => {
      const x0 = a(V0) / (a(V0) + b(V0)), xi = a(V) / (a(V) + b(V)), tau = 1 / (a(V) + b(V));
      return xi - (xi - x0) * Math.exp(-t / tau);
    };
    return { n: relax(paper.an, paper.bn), m: relax(paper.am, paper.bm), h: relax(paper.ah, paper.bh) };
  };
  const quiet = { rs: 0, noise: { ...DEFAULT_NOISE, recSigma: 0, humAmp: 0, recFilter: 0 as const }, glu: { ...DEFAULT_GLU, enabled: false }, gaba: { ...DEFAULT_GABA, enabled: false } };
  const leak = (vm: number) => 30 * (vm - HH.eLeak);

  it("Fig. 3, INa blocked: the current at the end of each step is ḡK n⁴ (V − E_K) plus the leak, within 0.5%", () => {
    const pr = VC_PRESETS.find((p) => p.id === "hh-vc-gk")!;
    const cell = buildCell({ ...publishedParams("hh"), block: ["na"] });
    const pts = runVCFamily(cell, quiet, pr.protocol).map((s) => measureSweep(s, pr.measures[0]));
    expect(pts).toHaveLength(11);
    for (const p of pts) {
      let sum = 0;
      const N = 200;
      for (let j = 0; j <= N; j++) sum += 3600 * exact(p.value, 10 + (2 * j) / N).n ** 4 * (p.value + 77) + leak(p.value);
      const want = sum / (N + 1);
      expect(Math.abs(p.i - want) / Math.abs(want), `${p.value} mV`).toBeLessThan(0.005);
    }
  });

  it("Fig. 6, IK blocked: the peak inward current is the peak of ḡNa m³h (V − E_Na) plus the leak, within 1%", () => {
    const pr = VC_PRESETS.find((p) => p.id === "hh-vc-gna")!;
    const cell = buildCell({ ...publishedParams("hh"), block: ["kd"] });
    const pts = runVCFamily(cell, quiet, pr.protocol).map((s) => measureSweep(s, pr.measures[0]));
    expect(pts).toHaveLength(10);
    for (const p of pts) {
      let want = Infinity;
      for (let t = 0.1; t <= 4; t += 0.001) {
        const g = exact(p.value, t);
        want = Math.min(want, 12000 * g.m ** 3 * g.h * (p.value - 50) + leak(p.value));
      }
      expect(Math.abs(p.i - want) / Math.abs(want), `${p.value} mV`).toBeLessThan(0.01);
    }
  });

  it("they are offered only on the squid axon", () => {
    expect(vcPresetsFor("hh").map((p) => p.id)).toEqual(expect.arrayContaining(["hh-vc-gk", "hh-vc-gna"]));
    expect(vcPresetsFor("rs").some((p) => p.model)).toBe(false);
  });
});
