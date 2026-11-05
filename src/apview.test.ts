/**
 * scripts/apview.ts, the spike-and-dV/dt page the owner measured the human beta cell's threshold criterion on
 * (2026-11-03), and asked to keep. These tests keep it working as the models change.
 */
import { describe, expect, it } from "vitest";
import { apView, apViewHtml, criterionIndex } from "../scripts/apview.ts";

describe("the spike measuring page", () => {
  it("draws the human beta cell's spike as the owner measured it: 0.5 V/s at −43.5 mV, rising at most 7 V/s", () => {
    const d = apView("betahuman", { pins: [0.5], before: 120, after: 80 });
    expect(d.maxDvdt).toBeCloseTo(7.0, 1);
    expect(d.peak).toBeCloseTo(-10.1, 1);
    expect(d.pins.map((p) => [p.criterion, +p.v.toFixed(1)])).toEqual([[0.5, -43.5]]);
    expect(d.v.length).toBe(d.dvdt.length);
  });

  it("finds a spike on a stepped cell, and the page fetches nothing", () => {
    const d = apView("gnrh", { pins: [1] });
    expect(d.peak).toBeGreaterThan(30);
    expect(d.pins).toHaveLength(1);
    const html = apViewHtml(d);
    expect(html).not.toMatch(/(src|href)=["']?https?:/);
    expect(html).not.toContain("__DATA__");
  });

  it("marks a criterion only where the upstroke reaches it", () => {
    expect(criterionIndex([0, 0.2, 0.6, 2, 5], 4, 0.5)).toBe(2);
    expect(criterionIndex([0, 0.2, 0.3], 2, 0.5)).toBe(-1);
  });
});
