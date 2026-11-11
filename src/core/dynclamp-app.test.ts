/**
 * The dynamic clamp as the app offers it (CellParams.clamp), and the numbers README.md, public/methods.html and
 * public/llms.txt quote for it. A clamp setting is plain data, because it has to cross to a worker.
 */
import { describe, expect, it } from "vitest";
import { buildCell, clampInjected, publishedParams } from "./cell.ts";
import { DEFAULT_CLAMP, describeClamp, type DynClamp } from "./dynclamp.ts";
import { MODELS, type ModelId } from "./models.ts";
import { DEFAULT_SIM, runSweep, settle } from "./simulate.ts";
import { sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

const clampOf = (g: number, as: DynClamp["as"] = "kv4"): DynClamp => ({ on: true, kind: "kv4", g, erev: -90, as });

/** Rheobase as the app's step protocol measures it: an 800 ms step from the model's holding current. */
function rheobase(id: ModelId, clamp?: DynClamp): number {
  const m = MODELS[id];
  const cell = buildCell({ ...publishedParams(id), clamp });
  const e = { rs: 15, cp: 0, bridge: 1 };
  const inp = { ihold: m.defaults.ihold, electrode: e, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
  const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [0] };
  const st = settle(cell, e, inp.ihold, m.settleMs, DEFAULT_SIM.dt);
  const fires = (a: number) => sweepStats(runSweep(cell, inp, proto, a, st, DEFAULT_SIM, 0), proto).nInStep > 0;
  let lo = 0, hi = 4 * m.rheobase + 50;
  while (hi - lo > m.rheobaseTol) {
    const mid = 0.5 * (lo + hi);
    if (fires(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

describe("the dynamic clamp setting", () => {
  it("is plain data: it survives the copy a worker message makes, and builds the same cell", () => {
    const p = { ...publishedParams("gnrh"), clamp: clampOf(8, "gating") };
    const q = structuredClone(p);
    expect(buildCell(q).vRest).toBe(buildCell(p).vRest);
    expect(buildCell(q).channels.length).toBe(buildCell(p).channels.length);
  });

  it("off, or at zero conductance, leaves the cell exactly as published", () => {
    const p = publishedParams("gnrh");
    for (const clamp of [undefined, DEFAULT_CLAMP, { ...clampOf(8), on: false }, clampOf(0)]) {
      expect(clampInjected({ ...p, clamp })).toEqual([]);
      expect(buildCell({ ...p, clamp }).rinRest).toBe(buildCell(p).rinRest);
    }
  });

  it("says what it is in words", () => {
    expect(describeClamp(undefined)).toBe("");
    expect(describeClamp(clampOf(8))).toBe("dynamic clamp: Kv4, +8 nS peak at 0 mV, reversing at -90 mV");
    expect(describeClamp({ on: true, kind: "leak", g: -0.5, erev: -80, as: "kv4" })).toBe("dynamic clamp: leak −0.5 nS, reversing at -80 mV");
    expect(describeClamp(clampOf(8, "gating"))).toContain("gating only");
  });
});

describe("the GnRH cell under dynamic clamp (the numbers the pages quote)", () => {
  // 8 nS at 0 mV on the 20 pF cell is 0.4 nS/pF, inside the range of Mendonça et al. 2018
  const p = publishedParams("gnrh");
  const off = buildCell(p), kv4 = buildCell({ ...p, clamp: clampOf(8) }), leak = buildCell({ ...p, clamp: clampOf(8, "leak") }), gating = buildCell({ ...p, clamp: clampOf(8, "gating") });

  it("Kv4 takes rest from −67.5 to −69.9 mV and input resistance from 506 to 307 MΩ", () => {
    expect(off.vRest).toBeCloseTo(-67.48, 1);
    expect(off.rinRest).toBeCloseTo(505.9, 0);
    expect(kv4.vRest).toBeCloseTo(-69.9, 1);
    expect(kv4.rinRest).toBeCloseTo(306.6, 0);
  });

  it("its leak does the same at rest; gating only leaves rest and input resistance alone", () => {
    expect(leak.vRest).toBeCloseTo(kv4.vRest, 2);
    expect(Math.abs(leak.rinRest / kv4.rinRest - 1)).toBeLessThan(0.005);
    expect(gating.vRest).toBeCloseTo(off.vRest, 4);
    expect(Math.abs(gating.rinRest / off.rinRest - 1)).toBeLessThan(1e-3);
  });

  it("rheobase: 15.8 pA, 43.1 with Kv4, 31.0 with its leak, 22.2 with gating only. Here the leak is a little over half", () => {
    const r = { off: rheobase("gnrh"), kv4: rheobase("gnrh", clampOf(8)), leak: rheobase("gnrh", clampOf(8, "leak")), gating: rheobase("gnrh", clampOf(8, "gating")) };
    expect(r.off).toBeCloseTo(15.8, 0);
    expect(r.kv4).toBeCloseTo(43.1, 0);
    expect(r.leak).toBeCloseTo(31.0, 0);
    expect(r.gating).toBeCloseTo(22.2, 0);
    const share = (r.leak - r.off) / (r.kv4 - r.off);
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.6);
  });

  it("subtracting 6 nS leaves it with no rest near its own", () => {
    const sub = buildCell({ ...p, clamp: clampOf(-6) });
    expect(Math.abs(sub.vRest - off.vRest)).toBeGreaterThan(15);
  });
});

describe("the pyramidal cell under dynamic clamp", () => {
  it("at 0.4 nS/pF the leak is 40% of the Kv4's change in rheobase: how much is leak depends on the cell", () => {
    const r = { off: rheobase("rs"), kv4: rheobase("rs", clampOf(116)), leak: rheobase("rs", clampOf(116, "leak")) };
    const share = (r.leak - r.off) / (r.kv4 - r.off);
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.45);
  });
});
