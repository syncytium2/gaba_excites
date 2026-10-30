import { describe, expect, it } from "vitest";
import type { VCSweep, VCWindowSweep } from "../core/vclamp.ts";
import { planRefine, spliceWindow, REFINE_SPAN_MS } from "./refine.ts";

const sweep = (n: number, dt: number, f: (t: number) => number, starts = [0, 1]): VCSweep => {
  const a = Float32Array.from({ length: n }, (_, j) => f(j * dt));
  return { value: 0, sampleMs: dt, iRec: a, iTrue: a.slice(), vm: a.slice(), vCmd: a.slice(), starts };
};
const win = (t0: number, m: number, dt: number, f: (t: number) => number): VCWindowSweep => {
  const a = Float32Array.from({ length: m }, (_, j) => f(t0 + j * dt));
  return { value: 0, t0, sampleMs: dt, iRec: a, iTrue: a.slice(), vm: a.slice(), vCmd: a.slice() };
};

describe("zoom refinement: when to re-simulate", () => {
  it("runs a window of the view plus a quarter of its span each side, only at 2 ms or narrower", () => {
    expect(planRefine(10, 11, 80, null)).toEqual({ action: "run", t0: 9.75, t1: 11.25 });
    expect(planRefine(0, 0.4, 80, null)).toEqual({ action: "run", t0: 0, t1: 0.5 }); // clipped at the sweep's start
    expect(planRefine(10, 10 + REFINE_SPAN_MS + 0.1, 80, null)).toEqual({ action: "keep" }); // too wide: nothing to do
  });
  it("keeps a refinement the view lies inside, and drops it on zooming out or panning away", () => {
    const now = { t0: 9.75, t1: 11.25 };
    expect(planRefine(10, 11, 80, now)).toEqual({ action: "keep" });
    expect(planRefine(10.2, 10.6, 80, now)).toEqual({ action: "keep" });
    expect(planRefine(0, 80, 80, now)).toEqual({ action: "drop" }); // the double-click reset
    expect(planRefine(20, 21, 80, now).action).toBe("run");
  });
});

describe("zoom refinement: the traces on one time axis", () => {
  it("keeps the standard samples outside the window and every fine sample inside it", () => {
    const f = (t: number) => Math.round(t * 1000);
    const s = sweep(101, 0.01, f); // 0..1 ms
    const r = spliceWindow([s], { t0: 0.3, t1: 0.5, fineDt: 0.001, sweeps: [win(0.3, 201, 0.001, f)] }, null);
    expect(r.t[0]).toBe(0);
    expect(r.t[r.t.length - 1]).toBeCloseTo(1, 9);
    for (let j = 1; j < r.t.length; j++) expect(r.t[j]).toBeGreaterThan(r.t[j - 1]); // one increasing axis
    const at = (t: number) => r.iRec[0][Array.from(r.t).findIndex((x) => Math.abs(x - t) < 1e-9)];
    expect(at(0.2)).toBe(200);
    expect(at(0.346)).toBe(346);
    expect(at(0.8)).toBe(800);
    // no refinement: the standard traces unchanged
    const plain = spliceWindow([s], null, null);
    expect(plain.t.length).toBe(101);
    expect(plain.iRec[0][50]).toBe(500);
  });
  it("blanks the fine samples after a step, as the standard ones are", () => {
    const f = (t: number) => (t < 0.5 ? 1 : 99);
    const s = sweep(101, 0.01, f, [0, 0.5]);
    const r = spliceWindow([s], { t0: 0.4, t1: 0.7, fineDt: 0.001, sweeps: [win(0.4, 301, 0.001, f)] }, 0.1);
    const at = (t: number) => r.iRec[0][Array.from(r.t).findIndex((x) => Math.abs(x - t) < 1e-9)];
    expect(at(0.55)).toBe(1); // held from before the step
    expect(at(0.65)).toBe(99); // past the blank
  });
});
