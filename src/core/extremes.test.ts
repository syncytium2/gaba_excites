/**
 * The siren: silent through everything the presets ask of each cell, and
 * tripping for the right reason when a cell is driven past it.
 */
import { describe, expect, it } from "vitest";
import { buildCell, publishedParams } from "./cell.ts";
import { DEFAULT_SIM, runFamily, runSweep, settle } from "./simulate.ts";
import { sweepStats } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { PRESETS, toProtocol } from "./protocol.ts";
import { MODELS, MODEL_LIST } from "./models.ts";
import { ExtremeWatch, limitsFor, settingWarnings, type ExtremeKind } from "./extremes.ts";
import { readFileSync } from "node:fs";

const E = { rs: 15, cp: 0, bridge: 1 };

function tripsOf(id: "rs" | "fs" | "gnrh", amps: number[], ihold = MODELS[id].defaults.ihold): Set<ExtremeKind>[] {
  const cell = buildCell(publishedParams(id));
  const p = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps };
  return runFamily(cell, { ihold, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA }, p, { ...DEFAULT_SIM, settleMs: 1500 }).map((s) => {
    const w = new ExtremeWatch(limitsFor(cell, MODELS[id]));
    w.feed(s.vm, s.iCmd, 0, s.sampleMs);
    return new Set(w.trips.keys());
  });
}

describe("the siren stays silent in ordinary use", () => {
  for (const preset of PRESETS) {
    it(`${preset.model}: ${preset.label}`, () => {
      const m = MODELS[preset.model];
      const cell = buildCell({ ...publishedParams(preset.model), ...(preset.knobs && { knobs: preset.knobs }) });
      const proto = toProtocol(preset.protocol);
      const inputs = { ihold: preset.ihold ?? m.defaults.ihold, electrode: E, glu: preset.glu, gaba: { ...preset.gaba } };
      const sweeps = runFamily(cell, inputs, proto, { ...DEFAULT_SIM, settleMs: Math.min(m.settleMs, 3000) });
      for (const s of sweeps) {
        const w = new ExtremeWatch(limitsFor(cell, m, [preset.glu, preset.gaba]));
        w.feed(s.vm, s.iCmd, 0, s.sampleMs);
        expect([...w.trips.keys()], `${s.amp} pA`).toEqual([]);
      }
    });
  }
});

describe("the siren trips for the right reason", () => {
  it("pyramidal at 12.8 nA: past the current bound (5.6 nA), while its spikes still overshoot", () => {
    const [t] = tripsOf("rs", [12800]);
    expect([...t]).toEqual(["current"]);
  });

  it("both Pospischil cells at 25.6 nA: depolarization block", () => {
    for (const id of ["rs", "fs"] as const) expect(tripsOf(id, [25600])[0].has("block")).toBe(true);
  });

  it("a large hyperpolarizing step drives Vm below E_K, which no conductance can", () => {
    const [t] = tripsOf("rs", [-3000]); // 32 MΩ × 3 nA ≈ 96 mV below rest
    expect([...t]).toEqual(["range"]);
  });

  it("spikes that fail to overshoot trip it", () => {
    const w = new ExtremeWatch({ vMin: -120, vMax: 60, iCenter: 0, iBound: 1e9, spikeUp: -20, overshoot: 0 });
    // three small spikes, peaking at −5 mV, between troughs at −60 mV
    const v: number[] = [];
    for (let s = 0; s < 3; s++) for (let k = 0; k < 40; k++) v.push(-60 + 55 * Math.exp(-(((k - 20) / 4) ** 2)));
    w.feed(v, v.map(() => 0), 0, 0.05);
    expect(w.trips.get("overshoot")?.value).toBeCloseTo(-5, 0);
  });
});

describe("each model's rheobase, which sets its current bound", () => {
  it("GnRH: 17 pA from −6 pA, 800 ms step", () => {
    const m = MODELS.gnrh;
    const cell = buildCell(publishedParams("gnrh"));
    const st = settle(cell, E, m.defaults.ihold, m.settleMs, DEFAULT_SIM.dt);
    const p = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [0] };
    const inp = { ihold: m.defaults.ihold, electrode: E, glu: DEFAULT_GLU, gaba: DEFAULT_GABA };
    const fires = (a: number) => sweepStats(runSweep(cell, inp, p, a, st, DEFAULT_SIM, 0), p).nInStep > 0;
    let lo = 0, hi = 100;
    while (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      if (fires(mid)) hi = mid;
      else lo = mid;
    }
    expect(Math.abs(hi - m.rheobase)).toBeLessThanOrEqual(1);
  });

  it("every model declares one, or a current scale where rheobase is undefined (the pyramidal, FS and LTS values are pinned in gaba.test.ts, fs.test.ts and lts.test.ts; the beta cell's scale in beta-app.test.ts)", () => {
    for (const m of MODEL_LIST) expect(m.currentScale ?? m.rheobase).toBeGreaterThan(0);
    expect(MODELS.rs.rheobase).toBe(561);
    expect(MODELS.fs.rheobase).toBe(385);
    expect(MODELS.lts.rheobase).toBe(39);
  });
});

describe("the siren's setting warnings", () => {
  // the owner, 2026-11-04: "Keep the psc panel with a siren warning. This is exactly what we built the site for"
  const on = { ...DEFAULT_GABA, enabled: true };
  it("warns when a PSC input is on for a beta cell, which receives no such synapses, and only then", () => {
    for (const id of ["betahuman", "betamouse"] as const) {
      expect(settingWarnings(MODELS[id], [on])[0]).toMatch(/No GABA synapses onto beta cells are described.*Braun et al\. 2010.*Menegaz et al\. 2019.*Korol et al\. 2018/);
      // Korol 2018's abstract: the islet's GABA concentration is unknown; 100–1000 nM is where the receptors open most
      const note = settingWarnings(MODELS[id], [on])[0];
      expect(note).toMatch(/islet holds is unknown/);
      expect(note).not.toMatch(/ambient 100|receive no GABA synapses|that steady signal/);
      expect(settingWarnings(MODELS[id], [{ ...DEFAULT_GLU, enabled: true }])).toHaveLength(1);
      expect(settingWarnings(MODELS[id], [{ ...on, enabled: false }, DEFAULT_GLU])).toEqual([]);
      expect(settingWarnings(MODELS[id], [{ ...on, rate: 0 }])).toEqual([]);
    }
    for (const m of MODEL_LIST.filter((x) => !x.id.startsWith("beta"))) expect(settingWarnings(m, [on])).toEqual([]);
  });
  it("on the human cell, calls the bath GABA knob a drug dose, not the islet's own signal", () => {
    const on = { ...DEFAULT_GABA, enabled: true };
    expect(settingWarnings(MODELS.betahuman, [on])[0]).toMatch(/not the islet's own signal.*10 µM to 1 mM/);
  });
  it("cites only papers in lit/sources.json", () => {
    const keys = JSON.parse(readFileSync("lit/sources.json", "utf8")).sources.map((s: { key: string }) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["braun2010", "menegaz2019", "korol2018"]));
  });
});
