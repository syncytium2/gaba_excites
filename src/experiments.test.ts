/**
 * Keeps tools/experiments/ alive: experiments import the model, and a model
 * change that breaks one should fail here rather than on the day someone
 * reaches for it (a lecture, a reviewer's question).
 */
import { describe, expect, it } from "vitest";
import { MODELS } from "./core/models.ts";
import { buildCell } from "./core/cell.ts";
import { BATH, bridgeError, budget, henderson, oneSidedShift, PATCHES, patchVrev, pipette, refit } from "../tools/experiments/chloride_calibration.ts";
import { fig7fCounts, longStep, meanHInf, withSlowIk } from "../tools/experiments/slow_ik_inactivation.ts";
import { sweepShifts } from "../tools/experiments/na_shift.ts";
import { conditions, driveSweep, measure, startV } from "../tools/experiments/threshold_criteria.ts";
import { gabaTrain } from "../tools/experiments/lts_gaba_rebound.ts";

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

describe("experiment: threshold at 1, 2, 10 and 20 V/s, across cells and Na⁺ and K⁺ edits", () => {
  const thr = (r: ReturnType<typeof measure>) => r.thresholds.map((t) => t.v);
  const pick = { rs: "kd-0", fs: "kd-0", gnrh: "a-0" } as const;

  it("the criterion moves threshold 7 mV in the cortical cells and about 13.5 mV in GnRH", () => {
    const span = { rs: 7.2, fs: 7.0, gnrh: 13.5 } as const;
    for (const m of ["rs", "fs", "gnrh"] as const) {
      const t = thr(measure(m, conditions(m)[0]));
      expect(t[3] - t[0]).toBeCloseTo(span[m], 0);
      expect(t).toEqual([...t].sort((a, b) => a - b));
    }
  });

  it("a −6 mV Na⁺ shift moves threshold about 6 mV at every criterion; blocking a K⁺ current moves it under 0.5 mV at rheobase", () => {
    for (const m of ["rs", "fs", "gnrh"] as const) {
      const v0 = startV(m);
      const cs = conditions(m);
      const c = thr(measure(m, cs[0], v0));
      const na = thr(measure(m, cs.find((x) => x.id === "na-6")!, v0));
      const k = thr(measure(m, cs.find((x) => x.id === pick[m])!, v0));
      na.forEach((v, i) => expect(Math.abs(v - c[i] + 6)).toBeLessThan(1));
      k.forEach((v, i) => expect(Math.abs(v - c[i])).toBeLessThan(0.5));
    }
  });
});

describe("experiment: K⁺ block and threshold against drive", () => {
  it("GnRH held at −80 mV: blocking I_A lowers threshold at 20 V/s by over 2 mV at 3× rheobase, not at rheobase", () => {
    const c = driveSweep("gnrh", {}, -80, [1, 3]);
    const k = driveSweep("gnrh", { a: { g: 0 } }, -80, [1, 3]);
    const t20 = (r: typeof c, i: number) => r.rows[i].thresholds[3].v;
    expect(Math.abs(t20(k, 0) - t20(c, 0))).toBeLessThan(0.5);
    expect(t20(k, 1) - t20(c, 1)).toBeLessThan(-2);
    expect(k.rows[1].latency).toBeLessThan(0.2 * c.rows[1].latency);
  });

  it("pyramidal: blocking Kd moves threshold at 20 V/s by under 0.5 mV at every drive", () => {
    const c = driveSweep("rs", {}, -80, [1, 3, 5]);
    const k = driveSweep("rs", { kd: { g: 0 } }, -80, [1, 3, 5]);
    c.rows.forEach((r, i) => expect(Math.abs(k.rows[i].thresholds[3].v - r.thresholds[3].v)).toBeLessThan(0.5));
  });
});

describe("experiment: does GABA rebound the LTS cell the way a step does?", () => {
  it("E_GABA −80 mV: no, at any size up to 40 nS (100 Hz, 500 ms, from −64 mV); the train cannot take it below −79 mV", () => {
    for (const g of [3, 10, 40]) {
      const r = gabaTrain(60, 100, g, -80);
      expect(r.after).toEqual([]);
      expect(r.vMin).toBeGreaterThan(-79.5);
    }
  });

  it("a reversal further below the T channels' range does it: −85 mV at 10 nS, −90 mV at 5 nS, −95 mV at 3 nS", () => {
    expect(gabaTrain(60, 100, 5, -85).after).toEqual([]);
    expect(gabaTrain(60, 100, 10, -85).after.length).toBe(1);
    expect(gabaTrain(60, 100, 3, -90).after).toEqual([]);
    expect(gabaTrain(60, 100, 5, -90).after.length).toBe(1);
    expect(gabaTrain(60, 100, 3, -95).after.length).toBe(1);
    expect(gabaTrain(60, 100, 10, -95).during).toBe(0);
  });

  it("from the cell's own rest even −95 mV GABA does not rebound it", () => {
    expect(gabaTrain(0, 100, 10, -95).after).toEqual([]);
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

  it("the Fig. 2A reading agrees with the published patch values", () => {
    const v = patchVrev();
    PATCHES.forEach((p, i) => expect(Math.abs(p.fig2a - v[i])).toBeLessThan(0.5));
  });

  it("the gaps shrink with pipette Cl⁻: no constant offset fits, an offset plus a permeant anion does", () => {
    const r = refit();
    expect(r.gap.map((g) => Math.round(g))).toEqual([17, 8, 5]);
    expect(r.vsPaperTheory[2]).toBeLessThan(0); // the 40 mM patches sit under the paper's own theory line
    expect(r.offset.chi2).toBeGreaterThan(20);
    expect(r.offsetGluconate.chi2).toBeLessThan(5);
    expect(r.offsetGluconate.a).toBeCloseTo(6.1, 0);
    expect(r.ljpFractionGluconate.chi2).toBeLessThan(3);
    expect(r.ljpFractionGluconate.a).toBeCloseTo(0.46, 1);
  });

  it("with a 3 M KCl bridge and the puffer's chloride named, about 2 mV and 0.7 mM are left", () => {
    expect(bridgeError(1)).toBeCloseTo(2.3, 0);
    const b = budget(22);
    expect(b.offset).toBeCloseTo(2.2, 0);
    expect(b.anion).toBeCloseTo(0.7, 1);
    expect(b.chi2).toBeLessThan(4);
  });
});
