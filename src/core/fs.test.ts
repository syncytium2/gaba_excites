/**
 * The fast-spiking cell's numbers that the presets, README and methods page
 * quote, pinned so that a change to the model or the integrator cannot move
 * them quietly. Same 800 ms step on both Pospischil cells. Measured 2026-10-15:
 *
 *   rheobase, bisected to 1 pA    FS 385 pA          pyramidal 561 pA
 *   800 pA step                   FS 101 → 101 Hz    pyramidal 43 → 10 Hz (initial → final)
 *   first-spike half-width        FS 0.56 ms         pyramidal 0.70 ms
 *   Rin at rest                   FS 47.3 MΩ (template comment: "Rin = 48Meg")
 */
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams } from "./cell.ts";
import { DEFAULT_SIM, runFamily, runSweep, settle } from "./simulate.ts";
import { summarize, sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { PRESETS } from "./protocol.ts";

const inputs = { ihold: 0, electrode: { rs: 15, cp: 0, bridge: 1 }, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
const proto = (amps: number[]) => ({ sweepMs: 1000, stepStart: 100, stepDur: 800, amps });

describe("fast-spiking interneuron (Pospischil 2008 sIN_template)", () => {
  const fs = buildCell(publishedParams("fs"));

  it("rests at −70 mV with Rin 47.3 MΩ, as the template says (48)", () => {
    expect(fs.vRest).toBeCloseTo(-70, 2);
    expect(fs.rinRest).toBeCloseTo(47.3, 1);
  });

  it("rheobase is 385 pA", () => {
    const st = settle(fs, inputs.electrode, 0, 1000, DEFAULT_SIM.dt);
    const fires = (a: number) => sweepStats(runSweep(fs, inputs, proto([a]), a, st, DEFAULT_SIM, 0), proto([a])).nInStep > 0;
    let lo = 0, hi = 1000;
    while (hi - lo > 1) {
      const m = (lo + hi) / 2;
      if (fires(m)) hi = m;
      else lo = m;
    }
    expect(hi).toBeCloseTo(385, -0.5);
  });

  it("at 800 pA it fires at 101 Hz and does not adapt; the pyramidal cell adapts from 43 to 10 Hz", () => {
    const [f] = summarize(runFamily(fs, inputs, proto([800])), proto([800])).stats;
    expect(f.meanRate).toBeCloseTo(101.25, 1);
    expect(f.initialRate).toBeCloseTo(101, 0);
    expect(f.finalRate).toBeCloseTo(101, 0);
    const [p] = summarize(runFamily(buildCell(publishedParams("rs")), inputs, proto([800])), proto([800])).stats;
    expect(p.initialRate).toBeCloseTo(43, 0);
    expect(p.finalRate).toBeCloseTo(10, 0);
  });

  it("its spike is narrower than the pyramidal cell's: 0.56 against 0.70 ms", () => {
    const s = summarize(runFamily(fs, inputs, proto([380, 400])), proto([380, 400]));
    expect(s.apHalfWidth).toBeCloseTo(0.56, 2);
  });

  it("has presets of its own, and they belong to it", () => {
    const mine = PRESETS.filter((p) => p.model === "fs");
    expect(mine.map((p) => p.id)).toEqual(["fs-fi", "fs-noadapt"]);
  });
});
