/**
 * The human beta cell in the app: the numbers its presets and patterns quote, its current scale, the spike level
 * the app counts its spikes at, and what voltage clamp and the methods page say about it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectSpikes, sweepStats } from "./analysis.ts";
import { limitsFor } from "./extremes.ts";
import { buildCell } from "./cell.ts";
import { paramsFromKnobs } from "./human.ts";
import { runHuman } from "./human-run.ts";
import { MODELS, MODEL_LIST } from "./models.ts";
import { DEFAULT_NOISE } from "./noise.ts";
import { PRESETS, SCOPE_PULSE, patternsFor, presetsFor, toProtocol } from "./protocol.ts";
import { DEFAULT_SIM, runSweep, settle, type Inputs } from "./simulate.ts";
import { Stream } from "./stream.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";

const INPUTS: Inputs = {
  ihold: 0,
  electrode: { rs: 15, cp: 0, bridge: 1 },
  glu: { ...DEFAULT_GLU, enabled: false },
  gaba: { ...DEFAULT_GABA, enabled: false },
  noise: DEFAULT_NOISE,
};
const cellWith = (knobs: Record<string, number>) => buildCell({ model: "betahuman", cm: 10, gLeak: 0.15, knobs });

describe("human beta cell in the app", () => {
  it("its knobs are in pS/pF, the published values as whole numbers, and reach the model as the papers' nS/pF", () => {
    expect(MODELS.betahuman.knobs!.map((k) => [k.id, k.value])).toEqual([["gKATP", 10], ["gGABAR", 0], ["gSK", 100], ["gHERG", 0]]);
    expect(paramsFromKnobs({ gKATP: 21, gGABAR: 100, gSK: 100, gHERG: 200 })).toEqual({ gKATP: 0.021, gGABAR: 0.1, gSK: 0.1, gHERG: 0.2 });
    const katp = (k: Record<string, number>) => MODELS.betahuman.channels(k).find((c) => c.channel.id === "katp")!.gbar;
    expect(katp({ gKATP: 21 })).toBeCloseTo(0.21, 12); // nS at 10 pF
  });

  it("is in the model menu, with one step preset and three oscilloscope patterns", () => {
    expect(MODEL_LIST.map((m) => m.id)).toContain("betahuman");
    expect(presetsFor("betahuman").map((p) => p.id)).toEqual(["human-steps"]);
    expect(patternsFor("betahuman").map((p) => p.id)).toEqual(["human-spiking", "human-gaba-silent", "human-gaba-active"]);
  });

  it("its step preset: 12 spikes in the 2 s step with no current, 9 at −1 pA, none at −2 pA, 18 at +4 pA", () => {
    const p = PRESETS.find((x) => x.id === "human-steps")!;
    const proto = toProtocol(p.protocol);
    const cell = cellWith(p.knobs!);
    const st = settle(cell, INPUTS.electrode, 0, cell.model.settleMs, DEFAULT_SIM.dt);
    const n = (a: number) => sweepStats(runSweep(cell, INPUTS, proto, a, st, DEFAULT_SIM, 0), proto).nInStep;
    expect([n(0), n(-1), n(-2), n(4)]).toEqual([12, 9, 0, 18]);
    expect(p.note).toContain("12 spikes with no current, 9 at −1 pA, none at −2 pA, and 18 at +4 pA");
  });

  it("its current scale is the silent cell's rheobase, 1.0 pA, and the scope's pulse sits above it", () => {
    const cell = cellWith({ gKATP: 21 });
    const st = settle(cell, INPUTS.electrode, 0, cell.model.settleMs, DEFAULT_SIM.dt);
    const proto = { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [0] };
    const fires = (a: number) => sweepStats(runSweep(cell, INPUTS, { ...proto, amps: [a] }, a, st, DEFAULT_SIM, 0), proto).nInStep > 0;
    expect(fires(0.9)).toBe(false);
    expect(fires(1.0)).toBe(true);
    expect(cell.rinRest / 1000).toBeCloseTo(4.4, 1); // GΩ
    expect(MODELS.betahuman.currentScale).toBe(1);
    expect(SCOPE_PULSE.betahuman.amp).toBeGreaterThan(1);
  });

  it("the patterns' numbers: 5.7 Hz from −69 to −10 mV; silent at −54 mV; GABA's single spike and −44 mV; 7.7 Hz with 10 µM", () => {
    const [spiking, silent, active] = patternsFor("betahuman");
    const r = runHuman(paramsFromKnobs(spiking.knobs), 10000, 0.01, { skipMs: 2000 });
    expect(r.rate).toBeCloseTo(5.7, 1);
    expect(Math.round(r.vMin)).toBe(-69);
    expect(Math.round(r.vMax)).toBe(-10);
    expect(spiking.note).toContain("about 5.7 spikes a second, from troughs near −69 mV to peaks near −10 mV");

    const s = runHuman(paramsFromKnobs(silent.knobs), 8000, 0.01, { skipMs: 6000, change: { atMs: 3000, over: paramsFromKnobs({ ...silent.knobs, gGABAR: 100 }) } });
    expect(s.spikes.filter((t) => t < 3000)).toHaveLength(0);
    expect(s.spikes.filter((t) => t >= 3000)).toHaveLength(1);
    expect(Math.round(s.end[0])).toBe(-44);
    expect(Math.round(runHuman(paramsFromKnobs(silent.knobs), 4000, 0.01).end[0])).toBe(-54);
    expect(silent.note).toContain("silent at −54 mV");
    expect(silent.note).toContain("a single spike and settles near −44 mV");

    expect(runHuman(paramsFromKnobs({ ...active.knobs, gGABAR: 20 }), 10000, 0.01, { skipMs: 2000 }).rate).toBeCloseTo(7.7, 1);
    expect(active.note).toContain("about 7.7 times a second");
  });

  it("counts spikes at −30 mV, so the small ones of the papers' conditions count; every other model at −20 mV", () => {
    expect(MODELS.betahuman.spikeLevel).toBe(-30);
    for (const m of MODEL_LIST) if (m.id !== "betahuman") expect(m.spikeLevel).toBeUndefined();
    // with 10 µM GABA the spikes peak below −20 mV (human.test.ts): the step protocol and the scope both count them
    const knobs = { gKATP: 10, gGABAR: 20, gSK: 100, gHERG: 0 };
    expect(runHuman(paramsFromKnobs(knobs), 6000, 0.01, { skipMs: 2000 }).vMax).toBeLessThan(-20);
    const cell = cellWith(knobs);
    const st = settle(cell, INPUTS.electrode, 0, cell.model.settleMs, DEFAULT_SIM.dt);
    const proto = { sweepMs: 2000, stepStart: 0, stepDur: 2000, amps: [0] };
    const n = sweepStats(runSweep(cell, INPUTS, proto, 0, st, DEFAULT_SIM, 0), proto).nInStep;
    expect(n).toBeGreaterThanOrEqual(14);
    const stream = new Stream(cell, { ...INPUTS, pulse: { ...SCOPE_PULSE.betahuman, enabled: false } });
    let k = 0;
    for (let i = 0; i < 20; i++) k += stream.advance(100).spikes.length;
    expect(k).toBeGreaterThanOrEqual(14);
  });

  it("its slow spikes never reach 20 V/s, so they have no threshold or half-width by that criterion, not −30 mV", () => {
    const cell = cellWith({});
    const st = settle(cell, INPUTS.electrode, 0, cell.model.settleMs, DEFAULT_SIM.dt);
    const proto = { sweepMs: 2000, stepStart: 0, stepDur: 2000, amps: [0] };
    const sw = runSweep(cell, INPUTS, proto, 0, st, DEFAULT_SIM, 0);
    const sp = detectSpikes(sw.vm, sw.sampleMs, sw.spikeLevel);
    expect(sp.length).toBeGreaterThan(10);
    for (const x of sp) {
      expect(x.threshold).toBeNaN();
      expect(x.halfWidth).toBeNaN();
      expect(x.peak).toBeGreaterThan(-12);
    }
  });

  it("the siren counts its spikes at −30 mV and does not ask them to overshoot 0 mV; every other model's are unchanged", () => {
    const lim = limitsFor(cellWith({}), MODELS.betahuman);
    expect(lim.spikeUp).toBe(-30);
    expect(lim.overshoot).toBeNull();
    for (const m of MODEL_LIST) {
      if (m.id === "betahuman") continue;
      const l = limitsFor(buildCell({ model: m.id, cm: m.defaults.cm, gLeak: m.defaults.gLeak }), m);
      expect([l.spikeUp, l.overshoot]).toEqual([-20, 0]);
    }
  });

  it("voltage clamp and the methods page say how far its currents rest on voltage-clamp data", () => {
    expect(MODELS.betahuman.vcNote).toMatch(/voltage-clamp recordings of human beta cells/);
    expect(MODELS.betahuman.vcNote).toMatch(/activate instantly/);
    // Pedersen 2010 Supporting Material, Figs. S1B and S2B: the fits used E_Ca +40 and E_Na +100 mV
    expect(MODELS.betahuman.vcNote).toMatch(/\+100 and \+40 mV/);
    const methods = readFileSync(new URL("../../public/methods.html", import.meta.url), "utf8");
    expect(methods).toMatch(/id="betahuman"/);
    expect(methods).toMatch(/id="human-vc"/);
  });
});
