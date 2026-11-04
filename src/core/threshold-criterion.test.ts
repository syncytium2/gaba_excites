/**
 * Spike threshold's dV/dt criterion belongs to the model (docs/adr, "spike threshold's criterion belongs to the
 * model"). Labs define threshold differently for different neurons, and the app teaches that: each model measures at
 * its own criterion, every criterion has a source, and the phase plot's switch tries the others.
 */
import { describe, expect, it } from "vitest";
import { MODEL_LIST, MODELS } from "./models.ts";
import { CRITERIA } from "./threshold.ts";
import { buildCell, publishedParams } from "./cell.ts";
import { DEFAULT_SIM, runFamily } from "./simulate.ts";
import { summarize } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

describe("each model's threshold criterion", () => {
  it("is one of the criteria the app cites, or none for a cell the app never measures threshold on", () => {
    const vps = CRITERIA.map((c) => c.vps);
    for (const m of MODEL_LIST) {
      if (m.thresholdDvdt === null) expect(m.scopeOnly, `${m.id} has no criterion but runs steps`).toBeTruthy();
      else expect(vps, m.id).toContain(m.thresholdDvdt);
    }
    for (const c of CRITERIA) expect(c.source.length, `${c.vps} V/s has no source`).toBeGreaterThan(10);
  });

  it("is the owner's: 0.5 V/s human beta, 1 V/s GnRH, 10 V/s the cortical cells and the squid axon", () => {
    expect(Object.fromEntries(MODEL_LIST.map((m) => [m.id, m.thresholdDvdt]))).toEqual({
      rs: 10, fs: 10, lts: 10, gnrh: 1, betamouse: null, betahuman: 0.5, hh: 10,
    });
  });

  it("is what a sweep is measured at, unless another is asked for, and the summary says which", () => {
    const inputs = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
    const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [15, 20] };
    const sw = runFamily(buildCell(publishedParams("gnrh")), inputs, proto, DEFAULT_SIM);
    expect(sw[0].threshDvdt).toBe(MODELS.gnrh.thresholdDvdt);
    const own = summarize(sw, proto);
    const at20 = summarize(sw, proto, 20);
    expect([own.threshDvdt, at20.threshDvdt]).toEqual([1, 20]);
    // the criterion moves the number: GnRH's threshold is ~13 mV lower at 1 V/s than at 20
    expect(at20.threshold - own.threshold).toBeGreaterThan(10);
  });
});
