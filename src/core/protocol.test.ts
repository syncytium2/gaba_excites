/**
 * The family's increment as the amplifier sets it: a dial, a range switch and
 * a sign. Every preset's increment must show exactly on the dial in some range.
 */
import { describe, expect, it } from "vitest";
import { amplitudes, incRangeFits, incRangeFor, INC_RANGES, PRESETS } from "./protocol.ts";
import { MODEL_LIST } from "./models.ts";

describe("the increment's range switch", () => {
  it("shows each preset's increment exactly, and steps down when the sign says so", () => {
    for (const p of PRESETS) expect(INC_RANGES.some((r) => incRangeFits(p.protocol.delta, r)), p.id).toBe(true);
    expect(incRangeFor(0.5)).toBe(0.1);
    expect(incRangeFor(-25)).toBe(10);
    expect(incRangeFor(5)).toBe(1);
    expect(incRangeFor(200)).toBe(10);
    expect(incRangeFor(10, 10)).toBe(10); // the user's choice holds while it fits
    expect(incRangeFor(10, 0.1)).toBe(1); // 100 × 0.1 is off the dial
    expect(amplitudes({ mode: "family", first: 0, delta: -5, count: 4, list: "", sweepMs: 1, stepStart: 0, stepDur: 1 })).toEqual([0, -5, -10, -15]);
  });
});

// Choosing a model opens its first preset; a model with none blanked the page
// (found 2026-10-29 when the squid axon was added).
describe("every model the app offers", () => {
  for (const m of MODEL_LIST) {
    it(`${m.short} has at least one preset`, () => {
      expect(PRESETS.some((p) => p.model === m.id)).toBe(true);
    });
  }
});
