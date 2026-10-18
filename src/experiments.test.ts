/**
 * Keeps tools/experiments/ alive: experiments import the model, and a model
 * change that breaks one should fail here rather than on the day someone
 * reaches for it (a lecture, a reviewer's question).
 */
import { describe, expect, it } from "vitest";
import { MODELS } from "./core/models.ts";
import { buildCell } from "./core/cell.ts";
import { fig7fCounts, longStep, meanHInf, withSlowIk } from "../tools/experiments/slow_ik_inactivation.ts";
import { sweepShifts } from "../tools/experiments/na_shift.ts";

describe("experiment: DeFazio & Moenter 2021 slow I_K inactivation on the Adams 2018 GnRH model", () => {
  it("at the measured V½ (−30 mV) the paper's Fig. 7F counts are unchanged", () => {
    expect(withSlowIk(-30, fig7fCounts)).toEqual([0, 0, 0, 1, 4, 6]);
  });

  it("the gate barely closes while the cell fires, and pushing V½ to −65 mV raises firing", () => {
    const pub = longStep(24, 3000);
    const at30 = withSlowIk(-30, () => longStep(24, 3000));
    expect(meanHInf(at30.vm, -30)).toBeGreaterThan(0.95);
    expect(Math.abs(at30.spikes - pub.spikes)).toBeLessThanOrEqual(1);
    const at65 = withSlowIk(-65, () => longStep(24, 3000));
    expect(at65.spikes).toBeGreaterThan(pub.spikes);
  });

  it("always restores the published model", () => {
    const k = () => buildCell({ model: "gnrh", cm: 20, gLeak: 1 }).channels.find((c) => c.id === "k")!;
    withSlowIk(-30, () => expect(k().nGates).toBe(2));
    expect(k().nGates).toBe(1);
    expect(() => withSlowIk(-30, () => { throw new Error("boom"); })).toThrow("boom");
    expect(MODELS.gnrh.channels().find((c) => c.channel.id === "k")!.channel.nGates).toBe(1);
  });
});

describe("experiment: shifting the Traub Na⁺ channel's voltage dependence in the pyramidal and fast-spiking cells", () => {
  it("activation shifts move threshold about 1 mV per mV in both cells; ±6 mV of inactivation shift barely moves anything", () => {
    for (const model of ["rs", "fs"] as const) {
      const [c, aNeg, aPos, iNeg, iPos] = sweepShifts(model, [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6]]);
      expect(c.rheobase).toBeCloseTo(model === "rs" ? 561 : 385, -0.5);
      expect(aNeg.threshold - c.threshold).toBeCloseTo(-6, -0.5);
      expect(aPos.threshold - c.threshold).toBeCloseTo(7, -0.5);
      expect(aNeg.rheobase).toBeLessThan(0.7 * c.rheobase);
      expect(aPos.rheobase).toBeGreaterThan(1.5 * c.rheobase);
      for (const r of [iNeg, iPos]) {
        expect(Math.abs(r.rheobase - c.rheobase)).toBeLessThanOrEqual(3);
        expect(Math.abs(r.threshold - c.threshold)).toBeLessThan(0.5);
      }
      // the Na⁺ channel is shut at rest, so no shift here moves rest or Rin
      for (const r of [aNeg, aPos, iNeg, iPos]) expect(r.vRest).toBeCloseTo(c.vRest, 1);
    }
  });

  it("always restores the published model", () => {
    sweepShifts("fs", [[6, 6]]);
    const [c] = sweepShifts("fs", [[0, 0]]);
    expect(c.rheobase).toBeCloseTo(385, -0.5);
  });
});
