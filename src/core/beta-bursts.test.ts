/**
 * The mouse beta cell's slow, glycolysis-paced patterns against Bertram et al.
 * (2004), Figs. 5 and 6: compound and accordion bursting. Split from beta.test.ts so vitest runs these long
 * simulations in parallel; see that file's header for the conventions
 * (starting values from the authors' figure files, dt = 0.05 ms here).
 */
import { describe, expect, it } from "vitest";
import { DOM_SETS } from "./beta.ts";
import { DOM_START, meanDiff, runDom } from "./beta-run.ts";

describe("beta cell: Figs. 5 and 6: compound and accordion bursting", () => {
  it("Fig. 5: compound bursting, episodes of bursts paced by FBP pulses ≈ 5 min apart", () => {
    const r = runDom(DOM_SETS.compound, DOM_START.compound, 16, 0.05);
    const per = meanDiff(r.fbpPeaks.slice(-3));
    expect(per).toBeGreaterThan(4);
    expect(per).toBeLessThan(6.5);
    const gaps = r.bursts.slice(1).map((t, i) => t - r.bursts[i]);
    // several bursts per episode (gaps under a minute) and long silences between episodes (over two minutes)
    expect(gaps.filter((g) => g < 60).length).toBeGreaterThanOrEqual(2 * gaps.filter((g) => g > 120).length);
    expect(gaps.filter((g) => g > 120).length).toBeGreaterThanOrEqual(2);
  });

  it("Fig. 6: accordion bursting, which never shuts off and whose rhythm swells and shrinks with each FBP pulse", () => {
    const r = runDom(DOM_SETS.accordion, DOM_START.accordion, 16, 0.05);
    const gaps = r.bursts.slice(1).map((t, i) => t - r.bursts[i]).filter((_, i) => r.bursts[i] > 120);
    expect(Math.max(...gaps)).toBeLessThan(60);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.3);
    const per = meanDiff(r.fbpPeaks.slice(-3));
    expect(per).toBeGreaterThan(4);
    expect(per).toBeLessThan(6.5);
  });

});
