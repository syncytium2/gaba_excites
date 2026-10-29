/**
 * The beta cell as the app offers it: what its knobs, patterns, pulse and
 * current scale claim, measured. The patterns' notes quote numbers pinned in
 * beta.test.ts, beta-bursts.test.ts and beta-glycolytic.test.ts.
 */
import { describe, expect, it } from "vitest";
import { DOM_SETS, betaMouse } from "./beta.ts";
import { buildCell, knobValues, publishedParams } from "./cell.ts";
import { MODELS } from "./models.ts";
import { patternsFor, presetsFor, SCOPE_PULSE } from "./protocol.ts";
import { runSweep, settle, DEFAULT_SIM, type Inputs } from "./simulate.ts";
import { sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { DEFAULT_NOISE } from "./noise.ts";

const INPUTS: Inputs = {
  ihold: 0,
  electrode: { rs: 15, cp: 0, bridge: 1 },
  glu: { ...DEFAULT_GLU, enabled: false },
  gaba: { ...DEFAULT_GABA, enabled: false },
  noise: DEFAULT_NOISE,
};

describe("beta cell in the app", () => {
  it("its knobs reach its channels: a cell built from knob values is the cell built from the paper's set", () => {
    for (const [, set] of Object.entries(DOM_SETS)) {
      const a = buildCell({ model: "betamouse", cm: 5.3, gLeak: 0, knobs: set });
      const b = buildCell({ model: "betamouse", cm: 5.3, gLeak: 0 }, betaMouse(set));
      expect(a.gbar).toEqual(b.gbar);
      expect(a.vRest).toBeCloseTo(b.vRest, 9);
    }
    // left out, a knob takes the published value
    expect(knobValues(MODELS.betamouse, { rGK: 0.3 })).toEqual({ rGK: 0.3, gKATP: 25, gKCa: 0.6 });
    // the other models have none, and ignore any given
    expect(buildCell({ ...publishedParams("rs"), knobs: { rGK: 1 } }).gbar).toEqual(buildCell(publishedParams("rs")).gbar);
  });

  it("each pattern is one of the paper's parameter sets", () => {
    const sets = Object.values(DOM_SETS).map((s) => JSON.stringify(s));
    const pats = patternsFor("betamouse");
    expect(pats.length).toBe(4);
    for (const p of pats) expect(sets).toContain(JSON.stringify({ rGK: p.knobs.rGK, gKATP: p.knobs.gKATP, gKCa: p.knobs.gKCa }));
    expect(pats[0].note).toContain("32 s"); // beta.test.ts, Fig. 3
  });

  it("starts from the published point, not the steady state, and keeps a step preset only for the app's bookkeeping", () => {
    const cell = buildCell(publishedParams("betamouse"));
    const s = settle(cell, INPUTS.electrode, 0, 0, 0.01);
    expect(s[cell.iv]).toBe(-61);
    expect(s[cell.ix]).toBe(144);
    expect(presetsFor("betamouse").length).toBe(1);
  });

  it("its current scale is the glucose-free cell's rheobase, 0.9 pA, and the scope's pulse sits just above it", () => {
    const cell = buildCell({ model: "betamouse", cm: 5.3, gLeak: 0, knobs: { rGK: 0 } });
    const st = settle(cell, INPUTS.electrode, 0, cell.model.settleMs, 0.01);
    const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [0] };
    const fires = (a: number) => sweepStats(runSweep(cell, INPUTS, { ...proto, amps: [a] }, a, st, DEFAULT_SIM, 0), proto).nInStep > 0;
    expect(fires(0.8)).toBe(false);
    expect(fires(0.9)).toBe(true);
    expect(MODELS.betamouse.currentScale).toBe(0.9);
    expect(SCOPE_PULSE.betamouse.amp).toBeGreaterThan(0.9);
  });
});
