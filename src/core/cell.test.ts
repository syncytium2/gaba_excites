import { describe, expect, it } from "vitest";
import { buildCell, cellRinAt, PUBLISHED_RS } from "./cell.ts";

describe("cell", () => {
  it("the published defaults rebuild ModelDB 123623's leak exactly", () => {
    const c = buildCell(PUBLISHED_RS);
    // g_pas = 1e-4 S/cm² over π·96² µm²
    const gPas = 1e-4 * Math.PI * 96 * 96 * 1e-8 * 1e9;
    expect(c.gLeak / gPas).toBeCloseTo(1, 3);
    expect(c.vRest).toBeCloseTo(-70.571, 2);
  });

  it("Rin is what you would measure at rest, active conductances included", () => {
    for (const rin of [20, 80, 150, 400]) {
      const c = buildCell({ ...PUBLISHED_RS, rin });
      expect(cellRinAt(c, 0)).toBeCloseTo(rin, 3);
    }
  });

  it("Cm scales the cell: channel counts grow with area, densities do not", () => {
    const a = buildCell(PUBLISHED_RS);
    const b = buildCell({ ...PUBLISHED_RS, cm: PUBLISHED_RS.cm * 2 });
    for (let k = 0; k < a.gbar.length; k++) expect(b.gbar[k] / a.gbar[k]).toBeCloseTo(2, 9);
  });

  it("flags an Rin that the channels open at rest make impossible", () => {
    const c = buildCell({ ...PUBLISHED_RS, rin: 1e6 });
    expect(c.rinClamped).toBe(true);
    expect(buildCell(PUBLISHED_RS).rinClamped).toBe(false);
  });
});
