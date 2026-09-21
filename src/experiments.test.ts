/**
 * Keeps tools/experiments/ alive: experiments import the model, and a model
 * change that breaks one should fail here rather than on the day someone
 * reaches for it (a lecture, a reviewer's question).
 */
import { describe, expect, it } from "vitest";
import { MODELS } from "./core/models.ts";
import { buildCell } from "./core/cell.ts";
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
    const k = () => buildCell({ model: "gnrh", cm: 20, rin: 505.9 }).channels.find((c) => c.id === "k")!;
    withSlowIk(-30, () => expect(k().nGates).toBe(2));
    expect(k().nGates).toBe(1);
    expect(() => withSlowIk(-30, () => { throw new Error("boom"); })).toThrow("boom");
    expect(MODELS.gnrh.channels().find((c) => c.channel.id === "k")!.channel.nGates).toBe(1);
  });
});
