/**
 * Every number and claim in the guided tour's text (tour.ts), measured on
 * exactly the inputs its "Try this" sets. Measured 2026-10-19, 20 s runs,
 * GABA at the GnRH cell's measured event (1 nS, 10 ms decay, E −36.5 mV):
 *
 *   +7.5 pA, no input           −61.4 mV, silent for 60 s
 *   +7.5 pA, GABA 3/s           6–9 spikes in 20 s (about 1 PSP in 8)
 *   +7.5 pA, GABA 5/s, E −36.5  15–18 spikes   (about 1 in 6)
 *                      E −45    5–6
 *                      E −50    0–2
 *                      E −55    0
 *   −6 pA,  GABA 5/s, E −36.5   0
 *   Rheobase on Adams et al.'s 2 pA steps: 18 pA; gL 2 nS 28; Cm 40 pF 26
 *
 * The tour's text quotes these; update both together.
 */
import { describe, expect, it } from "vitest";
import { buildCell } from "./cell.ts";
import { runSweep, settle, DEFAULT_SIM, DEFAULT_ELECTRODE } from "./simulate.ts";
import { sweepStats } from "./analysis.ts";
import { toProtocol } from "./protocol.ts";
import { MODELS } from "./models.ts";
import { OPENING_IHOLD, TOUR, splitTerms, tourInputs, type TourSettings } from "./tour.ts";

const part = (id: string) => TOUR.find((p) => p.id === id)!.settings;

/** spikes in `ms` of continuous recording, from settled rest */
function spikes(s: TourSettings, seed: number, ms = 20000, over: Partial<ReturnType<typeof tourInputs>["gaba"]> = {}): number {
  const t = tourInputs(s);
  const cell = buildCell(t.cell);
  const st = settle(cell, DEFAULT_ELECTRODE, t.ihold, 3000, 0.01);
  const proto = { sweepMs: ms, stepStart: 0, stepDur: ms, amps: [0] };
  const inputs = { ihold: t.ihold, electrode: DEFAULT_ELECTRODE, glu: t.glu, gaba: { ...t.gaba, ...over } };
  return sweepStats(runSweep(cell, inputs, proto, 0, st, { ...DEFAULT_SIM, seed }, 0), proto).nInStep;
}

/** the Rheobase tile: the smallest step of the part's family that fires */
function familyRheobase(s: TourSettings): number {
  const t = tourInputs(s);
  const cell = buildCell(t.cell);
  const st = settle(cell, DEFAULT_ELECTRODE, t.ihold, 3000, 0.01);
  const proto = toProtocol(t.form);
  const inputs = { ihold: t.ihold, electrode: DEFAULT_ELECTRODE, glu: t.glu, gaba: t.gaba };
  return proto.amps.find((a) => sweepStats(runSweep(cell, inputs, proto, a, st, DEFAULT_SIM, 0), proto).nInStep > 0)!;
}

describe("the guided tour's text matches the model", () => {
  it("every part runs on the GnRH cell, and every term mark is closed", () => {
    for (const p of TOUR) {
      expect(p.settings.model, p.id).toBe("gnrh");
      for (const para of p.body) expect(para.includes("[[") || para.includes("]]"), `${p.id}: ${para}`).toBe(splitTerms(para).length > 1);
    }
  });

  it("the opening's holding current sits near −61 mV and is silent without input", () => {
    const t = tourInputs({ ...part("puzzle"), gaba: undefined });
    const cell = buildCell(t.cell);
    const st = settle(cell, DEFAULT_ELECTRODE, t.ihold, 20000, 0.01);
    expect(st[cell.iv]).toBeCloseTo(-61.4, 0);
    expect(spikes({ ...part("puzzle"), gaba: undefined }, 1, 60000)).toBe(0);
  });

  it("the resting cell rests at −67.5 mV", () => {
    expect(buildCell(tourInputs(part("rest")).cell).vRest).toBeCloseTo(-67.5, 1);
  });

  it("the puzzle: GABA fires the cell now and then, not on most PSPs", () => {
    for (const seed of [1, 2, 3]) {
      const n = spikes(part("puzzle"), seed); // about 60 PSPs in 20 s
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(15);
    }
  });

  it("glutamate at the same rate does much the same", () => {
    for (const seed of [1, 2]) expect(spikes(part("synapses"), seed)).toBeGreaterThanOrEqual(3);
  });

  it("sliding E_GABA: none at −70 or −55, a few by −45, about one PSP in six at −36.5", () => {
    const s = part("slide");
    expect(s.gaba?.erev).toBe(-70);
    for (const seed of [1, 2]) {
      expect(spikes(s, seed)).toBe(0);
      expect(spikes(s, seed, 20000, { erev: -55 })).toBe(0);
      expect(spikes(s, seed, 20000, { erev: -50 })).toBeLessThanOrEqual(3);
      expect(spikes(s, seed, 20000, { erev: -45 })).toBeGreaterThanOrEqual(3);
      const n = spikes(s, seed, 20000, { erev: MODELS.gnrh.defaults.eGaba }); // about 100 PSPs
      expect(n).toBeGreaterThanOrEqual(12);
      expect(n).toBeLessThanOrEqual(22);
    }
  });

  it("held at −70 mV, the same GABA never fires the cell", () => {
    expect(tourInputs(part("where-rest")).gaba.erev).toBe(-36.5);
    for (const seed of [1, 2]) expect(spikes(part("where-rest"), seed)).toBe(0);
  });

  it("rheobase tiles: 18 pA, 28 with double the leak, 26 with double Cm", () => {
    expect(familyRheobase(part("threshold"))).toBe(18);
    expect(familyRheobase(part("leak"))).toBe(28);
    expect(familyRheobase(part("size"))).toBe(26);
  });

  it("the opening's holding current is the one the text describes", () => expect(OPENING_IHOLD).toBe(7.5));
});
