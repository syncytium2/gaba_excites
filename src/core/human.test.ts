/**
 * The human beta cell (Riz, Braun & Pedersen 2014 on Pedersen 2010), held to three things:
 *   - the papers' equations and Table 1, as transcribed in lit/notes/riz2014.md;
 *   - the numbers and behaviors the papers report;
 *   - the authors' own equations (PLoSCompBiol_Fig1.ode), integrated separately by scipy's LSODA at tolerance
 *     1e-9 outside this repository: the numbers below marked LSODA come from that run (lit/notes/riz2014.md).
 * Spikes are upward crossings of −30 mV; rates and intervals are over 2–10 s, after the start's transient.
 */
import { describe, expect, it } from "vitest";
import { boltzmann } from "./channels.ts";
import { buildCell } from "./cell.ts";
import { HUMAN_CM, PEDERSEN_2010 as P, RIZ_2014, hCaLInf, humanBeta, makeHumanBK, tauKv } from "./human.ts";
import { runHuman } from "./human-run.ts";
import { MODELS } from "./models.ts";

const DT = 0.01;
const run = (over: Parameters<typeof runHuman>[0]) => runHuman(over, 10000, DT, { skipMs: 2000 });
const near = (x: number, target: number, rel: number) => expect(Math.abs(x - target) / Math.abs(target)).toBeLessThan(rel);

describe("human beta cell: the equations", () => {
  it("Table 1 as transcribed (Riz 2014), and Pedersen 2010's differences", () => {
    expect([RIZ_2014.VK, RIZ_2014.VNa, RIZ_2014.VCa, RIZ_2014.VCl]).toEqual([-75, 70, 65, -40]);
    expect([RIZ_2014.gNa, RIZ_2014.gCaL, RIZ_2014.gCaPQ, RIZ_2014.gCaT, RIZ_2014.gKv]).toEqual([0.4, 0.14, 0.17, 0.05, 1.0]);
    expect([RIZ_2014.gBK, RIZ_2014.BBK, RIZ_2014.gSK, RIZ_2014.kSK, RIZ_2014.nSK]).toEqual([0.02, 20, 0.1, 0.57, 5.2]);
    expect([RIZ_2014.gKATP, RIZ_2014.gLeak, RIZ_2014.VLeak, RIZ_2014.gHERG]).toEqual([0.01, 0.015, -30, 0]);
    expect(P).toEqual({ gSK: 0, gHERG: 0.2, gKATP: 0.015, nmCaPQ: -10 });
    expect(HUMAN_CM).toBe(10);
  });

  it("Eq. 29: x∞ = 1/(1 + exp((V − V_x)/n_x)), half at V_x", () => {
    expect(boltzmann(RIZ_2014.VmNa, RIZ_2014.nmNa)(-18)).toBeCloseTo(0.5, 12);
    expect(boltzmann(RIZ_2014.VmNa, RIZ_2014.nmNa)(0)).toBeGreaterThan(0.97); // activation rises with V
    expect(boltzmann(RIZ_2014.VhNa, RIZ_2014.nhNa)(-70)).toBeGreaterThan(0.98); // inactivation falls with V
  });

  it("Eq. 31: τ_mKv is τ0 + 10·exp((−20 − V)/6) from −26.6 mV up, τ0 + 30 below", () => {
    const t = tauKv(2);
    expect(t(-20)).toBeCloseTo(12, 12);
    expect(t(10)).toBeCloseTo(2 + 10 * Math.exp(-5), 12);
    expect(t(-40)).toBe(32);
    expect(t(-26.6)).toBeCloseTo(2 + 10 * Math.exp(1.1), 12); // the paper's 30, to 0.13%
  });

  it("Eq. 30: L-type inactivation follows its own current, clipped to [0, 1]", () => {
    const h = hCaLInf(RIZ_2014);
    const m = boltzmann(-25, -6);
    expect(h(-80)).toBeCloseTo(1 + (m(-80) * -145) / 57, 12);
    expect(h(65)).toBe(1); // no driving force, no inactivation
    for (let v = -100; v <= 60; v += 5) {
      expect(h(v)).toBeGreaterThanOrEqual(0);
      expect(h(v)).toBeLessThanOrEqual(1);
    }
    // U-shaped: none at rest, complete (clipped to 0) from about −20 to +5 mV where the L-type current is
    // largest, and partial again toward V_Ca
    expect(h(-80)).toBeGreaterThan(0.999);
    expect(h(-10)).toBe(0);
    expect(h(0)).toBe(0);
    expect(h(20)).toBeGreaterThan(h(10));
    expect(h(40)).toBeGreaterThan(h(20));
  });

  it("Eq. 17: BK is g_BK·m·(−I_Ca + B_BK), and refuses to run without I_Ca", () => {
    const bk = makeHumanBK(RIZ_2014);
    expect(bk.readsICa).toBe(true);
    const s = new Float64Array([0.5]);
    expect(bk.open(s, 0, 0, 0)).toBeCloseTo(0.5, 12); // no Ca²⁺ current: the basal B_BK alone
    expect(bk.open(s, 0, 0, -20)).toBeCloseTo(1.0, 12); // −20 pA/pF doubles it
    expect(() => bk.open(s, 0, 0)).toThrow();
    // the conductance: g_BK·B_BK = 0.02 nS/pA × 20 pA/pF = 0.4 nS/pF, × 10 pF
    expect(humanBeta().channels().find((c) => c.channel.id === "bk")!.gbar).toBeCloseTo(4, 12);
  });

  it("the cell builds, with the Ca²⁺-current input on, and only for this model", () => {
    const cell = buildCell({ model: "betahuman", cm: 10, gLeak: 0.15 });
    expect(cell.readsICa).toBe(true);
    for (const id of ["rs", "fs", "lts", "gnrh", "betamouse", "hh"] as const) {
      const m = MODELS[id];
      expect(buildCell({ model: id, cm: m.defaults.cm, gLeak: m.defaults.gLeak }).readsICa).toBe(false);
    }
    expect(Number.isFinite(cell.vRest)).toBe(true);
  });
});

describe("human beta cell: against the authors' equations (LSODA)", () => {
  it("Riz defaults: 5.740 Hz, interval 174.2 ms, −10.0 to −68.8 mV; first spikes at 105.47 and 279.72 ms", () => {
    const r = run({});
    near(r.rate, 5.74, 0.005);
    near(r.isi, 174.2, 0.005);
    expect(Math.abs(r.vMax - -10.01)).toBeLessThan(0.3);
    expect(Math.abs(r.vMin - -68.85)).toBeLessThan(0.2);
    expect(Math.abs(r.spikes[0] - 105.47)).toBeLessThan(0.2);
    expect(Math.abs(r.spikes[1] - 279.72)).toBeLessThan(0.2);
  });

  it("each configuration's interval within 0.5% of LSODA's", () => {
    const cases: [Parameters<typeof runHuman>[0], number][] = [
      [P, 216.1],
      [{ ...P, gHERG: 0 }, 141.7],
      [{ ...P, tmHERG: 500 }, 250.3],
      [{ ...P, gNa: 0 }, 312.5],
      [{ ...P, gKATP: 0.008 }, 162.2],
      [{ ...P, gKATP: 0.008, gNa: 0 }, 177.4],
      [{ gCaL: 0.1 }, 188.0],
      [{ gGABAR: 0.02 }, 130.7],
    ];
    for (const [over, isi] of cases) near(run(over).isi, isi, 0.005);
  });

  it("silent where LSODA is: g_K(ATP) 0.021 at −53.99 mV; g_CaL 0.1 with TTX at −46.92 mV", () => {
    for (const [over, v] of [[{ gKATP: 0.021 }, -53.99], [{ gCaL: 0.1, gNa: 0 }, -46.92]] as const) {
      const r = run(over);
      expect(r.spikes.filter((t) => t >= 2000)).toHaveLength(0);
      expect(Math.abs(r.vMax - v)).toBeLessThan(0.05);
    }
  });
});

describe("human beta cell: what the papers report", () => {
  it("Pedersen 2010: spikes at 4.6 Hz, peaking at −8 mV with troughs at −68 mV", () => {
    const r = run(P);
    expect(r.rate).toBeCloseTo(4.6, 1);
    expect(Math.abs(r.vMax - -8)).toBeLessThan(1);
    expect(Math.abs(r.vMin - -68)).toBeLessThan(0.5);
  });

  it("Pedersen 2010: blocking HERG raises the rate by about 52%, to 7 Hz; τ_mHERG = 500 ms lowers it to 4.0", () => {
    const base = run(P).rate;
    const blocked = run({ ...P, gHERG: 0 }).rate;
    expect(blocked).toBeCloseTo(7, 0);
    expect(Math.abs(blocked / base - 1.52)).toBeLessThan(0.02);
    expect(run({ ...P, tmHERG: 500 }).rate).toBeCloseTo(4.0, 1);
  });

  it("Pedersen 2010: TTX lengthens the interval from 217 to 312 ms; at g_K(ATP) 0.008, from 163 to 178 ms", () => {
    near(run(P).isi, 217, 0.01);
    near(run({ ...P, gNa: 0 }).isi, 312, 0.01);
    near(run({ ...P, gKATP: 0.008 }).isi, 163, 0.01);
    near(run({ ...P, gKATP: 0.008, gNa: 0 }).isi, 178, 0.01);
  });

  it("Riz 2014 Fig. 3: the interspike potential is about −70 mV, and about −61 mV with less L-type current", () => {
    expect(Math.abs(run({}).vMin - -70)).toBeLessThan(2);
    expect(Math.abs(run({ gCaL: 0.1 }).vMin - -61)).toBeLessThan(2);
  });

  it("Riz 2014 Fig. 3D: TTX silences the cell with less L-type current, unless K_ATP is small", () => {
    expect(run({ gCaL: 0.1, gNa: 0 }).spikes.filter((t) => t >= 2000)).toHaveLength(0);
    expect(run({ gCaL: 0.1, gNa: 0, gKATP: 0.002 }).rate).toBeGreaterThan(5);
  });

  it("Riz 2014 Fig. 5A: 100 µM GABA on a silent cell gives a single spike, then settles near −45 mV", () => {
    const r = runHuman({ gKATP: 0.021 }, 8000, DT, { skipMs: 6000, change: { atMs: 3000, over: { gKATP: 0.021, gGABAR: 0.1 } } });
    expect(r.spikes.filter((t) => t < 3000)).toHaveLength(0);
    expect(r.spikes.filter((t) => t >= 3000)).toHaveLength(1);
    expect(Math.abs(r.end[0] - -45)).toBeLessThan(2);
  });

  it("Riz 2014 Fig. 5B: 10 µM GABA depolarizes an active cell a little and speeds its firing", () => {
    const r = runHuman({}, 8000, DT, { change: { atMs: 3000, over: { gGABAR: 0.02 } } });
    const before = r.spikes.filter((t) => t >= 1000 && t < 3000).length / 2;
    const after = r.spikes.filter((t) => t >= 4000).length / 4;
    expect(after).toBeGreaterThan(before * 1.2);
    expect(run({ gGABAR: 0.02 }).vMin).toBeGreaterThan(run({}).vMin); // the troughs rise
  });
});
