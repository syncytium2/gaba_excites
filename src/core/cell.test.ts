import { describe, expect, it } from "vitest";
import { buildCell, cellRinAt, PUBLISHED_RS } from "./cell.ts";
import { MODELS } from "./models.ts";

describe("cell", () => {
  it("the published defaults rebuild ModelDB 123623's leak exactly", () => {
    const c = buildCell(PUBLISHED_RS);
    // g_pas = 1e-4 S/cm² over π·96² µm²
    const gPas = 1e-4 * Math.PI * 96 * 96 * 1e-8 * 1e9;
    expect(c.gLeak / gPas).toBeCloseTo(1, 4);
    expect(c.vRest).toBeCloseTo(-70.571, 2);
    expect(c.rinRest).toBeCloseTo(32.13, 2);
  });

  it("Rin is measured, not set: it is below 1/gL because channels open at rest conduct too", () => {
    for (const gLeak of [5, 20, 60]) {
      const c = buildCell({ ...PUBLISHED_RS, gLeak });
      expect(c.rinRest).toBeLessThan(1000 / gLeak);
      expect(c.rinRest).toBeCloseTo(cellRinAt(c, 0), 9);
    }
    // more leak, less Rin
    expect(buildCell({ ...PUBLISHED_RS, gLeak: 10 }).rinRest).toBeGreaterThan(buildCell({ ...PUBLISHED_RS, gLeak: 40 }).rinRest);
  });

  it("the leak is exactly what was set, whatever Cm or the channels do", () => {
    for (const cm of [50, PUBLISHED_RS.cm, 500]) expect(buildCell({ ...PUBLISHED_RS, cm, gLeak: 12.5 }).gLeak).toBe(12.5);
    // Remove the M current, which is open at rest: the leak stays put, and the
    // measured Rin rises — the effect a channel edit should show.
    const withM = buildCell({ ...PUBLISHED_RS, gLeak: 12.5 });
    const published = MODELS.rs.channels;
    MODELS.rs.channels = () => published().map((c) => (c.channel.id === "m" ? { ...c, gbar: 0 } : c));
    try {
      const noM = buildCell({ ...PUBLISHED_RS, gLeak: 12.5 });
      expect(noM.gLeak).toBe(12.5);
      expect(noM.rinRest).toBeGreaterThan(withM.rinRest);
    } finally {
      MODELS.rs.channels = published;
    }
  });

  it("Cm scales the cell: channel counts grow with area, densities do not", () => {
    const a = buildCell(PUBLISHED_RS);
    const b = buildCell({ ...PUBLISHED_RS, cm: PUBLISHED_RS.cm * 2 });
    for (let k = 0; k < a.gbar.length; k++) expect(b.gbar[k] / a.gbar[k]).toBeCloseTo(2, 9);
  });

  it("zero leak still builds a cell with a finite rest and Rin", () => {
    const c = buildCell({ ...PUBLISHED_RS, gLeak: 0 });
    expect(Number.isFinite(c.vRest)).toBe(true);
    expect(Number.isFinite(c.rinRest)).toBe(true);
  });
});
