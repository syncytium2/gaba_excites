/**
 * Keeps tools/experiments/ alive: experiments import the model, and a model
 * change that breaks one should fail here rather than on the day someone
 * reaches for it (a lecture, a reviewer's question).
 */
import { describe, expect, it } from "vitest";
import { MODELS } from "./core/models.ts";
import { buildCell } from "./core/cell.ts";
import { BATH, henderson, oneSidedShift, pipette, refit } from "../tools/experiments/chloride_calibration.ts";
import { fig7fCounts, longStep, meanHInf, withSlowIk } from "../tools/experiments/slow_ik_inactivation.ts";

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

describe("experiment: DeFazio et al. 2000's outside-out chloride calibration", () => {
  it("the Henderson equation reproduces the standard junction potentials", () => {
    expect(henderson({ K: 150, Cl: 150 }, { Na: 150, Cl: 150 })).toBeCloseTo(4.4, 0);
    expect(henderson({ K: 140, Glu: 140 }, BATH)).toBeCloseTo(16.4, 0);
    expect(henderson(pipette(1), BATH)).toBeCloseTo(16.3, 0);
  });

  it("a one-sided activity coefficient is a constant shift; a two-sided one cancels", () => {
    expect(oneSidedShift()).toBeCloseTo(7.17, 1);
    expect(Math.log((0.76 * 10) / (0.76 * 130))).toBeCloseTo(Math.log(10 / 130), 12);
  });

  it("the patch gaps are not constant, gluconate alone does not fit, and offset + gluconate does", () => {
    const r = refit();
    expect(r.vrev[0]).toBeCloseTo(-102.8, 0); // the paper's reported patch V_rev at 1 mM
    expect(r.gap[0]).toBeCloseTo(16.6, 0);
    expect(r.gap[1]).toBeCloseTo(8.1, 0);
    expect(r.gluconateOnly[1] / r.gluconateOnly[0]).toBeGreaterThan(5);
    expect(r.offset).toBeCloseTo(7.5, 0);
    expect(r.pGlu).toBeCloseTo(0.0044, 3);
    expect(r.predict40.vrev).toBeCloseTo(-24.0, 0);
  });
});
