/**
 * The mouse beta cell's slow, glycolysis-paced patterns against Bertram et al.
 * (2004), Figs. 7 and 8: glycolytic bursting and subthreshold oscillations. Split from beta.test.ts so vitest runs these long
 * simulations in parallel; see that file's header for the conventions
 * (starting values from the authors' figure files, dt = 0.05 ms here).
 */
import { describe, expect, it } from "vitest";
import { DOM_SETS } from "./beta.ts";
import { corr, DOM_START, meanDiff, runDom } from "./beta-run.ts";

describe("beta cell: Figs. 7 and 8: glycolytic bursting and subthreshold oscillations", () => {
  it("Fig. 7: slow glycolytic bursting, one long burst per FBP pulse, ≈ 5 min apart", () => {
    const r = runDom(DOM_SETS.glycolytic, DOM_START.glycolytic, 16, 0.05);
    const gaps = r.bursts.slice(1).map((t, i) => t - r.bursts[i]);
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    for (const g of gaps) {
      expect(g / 60).toBeGreaterThan(4);
      expect(g / 60).toBeLessThan(7);
    }
    expect(r.bursts.length).toBe(r.fbpPeaks.length);
  });

  it("Fig. 8: subthreshold glycolytic oscillations, no spikes, with ADP out of phase with Ca (Fig. 9A)", () => {
    const r = runDom(DOM_SETS.subthreshold, DOM_START.subthreshold, 16, 0.05);
    expect(r.spikes).toBe(0);
    expect(r.vMax - r.vMin).toBeGreaterThan(0.5);
    const per = meanDiff(r.fbpPeaks.slice(-3));
    expect(per).toBeGreaterThan(4);
    expect(per).toBeLessThan(6.5);
    expect(corr(r.ca, r.adp)).toBeLessThan(0);
  });

});
