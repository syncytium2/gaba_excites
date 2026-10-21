import { describe, expect, it } from "vitest";
import { applyZoom, expand, shrink } from "./zoom.ts";

describe("Igor-style marquee zoom", () => {
  it("Expand makes the marquee the view; Shrink undoes it", () => {
    const view: [number, number] = [0, 1500];
    const sel: [number, number] = [600, 900];
    expect(expand(view, sel)).toEqual([600, 900]);
    expect(shrink([600, 900], [600, 900])).toEqual([600, 900]);
    // shrinking 600–900 into a marquee at 660–720: the old view ends up where the marquee was,
    // 20% and 40% of the way across the new view, as 660 and 720 were across the old one
    const s = shrink([600, 900], [660, 720]);
    expect(s[0]).toBeCloseTo(300, 9);
    expect(s[1]).toBeCloseTo(1800, 9);
    expect((600 - s[0]) / (s[1] - s[0])).toBeCloseTo((660 - 600) / 300, 9);
    expect((900 - s[0]) / (s[1] - s[0])).toBeCloseTo((720 - 600) / 300, 9);
  });

  it("a marquee drawn right to left or bottom to top works the same", () => {
    expect(expand([0, 10], [8, 2])).toEqual([2, 8]);
    expect(shrink([0, 10], [8, 2])).toEqual(shrink([0, 10], [2, 8]));
  });

  it("Horiz and Vert touch one axis only", () => {
    const view = { x: [0, 1000] as [number, number], y: [-100, 50] as [number, number] };
    const sel = { x: [200, 400] as [number, number], y: [-80, -60] as [number, number] };
    expect(applyZoom("hexpand", view, sel)).toEqual({ x: [200, 400], y: undefined });
    expect(applyZoom("vexpand", view, sel)).toEqual({ x: undefined, y: [-80, -60] });
    expect(applyZoom("expand", view, sel)).toEqual({ x: [200, 400], y: [-80, -60] });
    const hs = applyZoom("hshrink", view, sel);
    expect(hs.y).toBeUndefined();
    expect(hs.x![1] - hs.x![0]).toBeCloseTo(5000, 9);
  });
});
