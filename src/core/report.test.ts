import { describe, expect, it } from "vitest";
import { buildCell, cellRinAt, publishedParams, type CellParams } from "./cell.ts";
import { MODELS } from "./models.ts";
import { DEFAULT_NOISE } from "./noise.ts";
import { DEFAULT_ELECTRODE, runFamily } from "./simulate.ts";
import { summarize } from "./analysis.ts";
import { DEFAULT_GABA, DEFAULT_GLU } from "./synapses.ts";
import { buildReport, parseRuns, recordRun, serializeRuns, settingsDiff, type RunSettings } from "./report.ts";
import { CRITERIA } from "./threshold.ts";

const APP = { version: "test", updated: "2026-10-18T00:00:00-04:00" };

function run(cell: CellParams, title: string, note = "") {
  const settings: RunSettings = {
    cell,
    ihold: 0,
    electrode: DEFAULT_ELECTRODE,
    protocol: { sweepMs: 1000, stepStart: 100, stepDur: 800, amps: [-100, 0, 500, 560, 600, 800] },
    glu: DEFAULT_GLU,
    gaba: DEFAULT_GABA,
    noise: DEFAULT_NOISE,
    seed: 1,
  };
  const built = buildCell(cell);
  const sweeps = runFamily(built, { ihold: 0, electrode: settings.electrode, glu: settings.glu, gaba: settings.gaba, noise: settings.noise }, settings.protocol);
  const summary = summarize(sweeps, settings.protocol);
  return {
    summary,
    rec: recordRun({
      title, note, settings, model: MODELS[cell.model], sweeps, summary, app: APP,
      cell: { vRest: built.vRest, rinRest: built.rinRest, rinAtHold: cellRinAt(built, 0) },
      now: new Date("2026-10-18T12:00:00Z"),
    }),
  };
}

describe("the lab notebook and its report", () => {
  const a = run(publishedParams("rs"), "Published pyramidal cell");
  const b = run({ ...publishedParams("rs"), gLeak: 20 }, "Less leak <b>bold</b>", "Hypothesis: less leak, lower rheobase.\nSecond line.");

  it("records threshold at every criterion, and at 20 V/s it agrees with the app's readout", () => {
    const t = a.rec.thresholds;
    expect(t.map((x) => x.vps)).toEqual(CRITERIA.map((c) => c.vps));
    expect(t[3].v).toBeCloseTo(a.summary.threshold, 1);
    expect(t.every((x) => !x.hitFloor)).toBe(true);
    // a stricter criterion sits higher on the upstroke
    for (let i = 1; i < t.length; i++) expect(t[i].v).toBeGreaterThan(t[i - 1].v);
    expect(a.rec.measures.rheobase).toBe(a.summary.rheobase);
    expect(a.rec.spike).not.toBeNull();
  });

  it("records the Vm each rheobase was measured from, and the report tabulates it", () => {
    // the owner, 2026-11-04: "Each rheobase should list the vm it was measured from"
    const rheo = a.summary.stats.find((x) => x.amp === a.summary.rheobase)!;
    expect(a.summary.rheobaseVm).toBe(rheo.vBaseline);
    expect(a.rec.measures.rheobaseVm).toBeCloseTo(rheo.vBaseline, 1);
    expect(a.rec.measures.rheobaseVm).toBeLessThan(-60);
    expect(buildReport([a.rec, b.rec], { title: "t", author: "", generatedAt: new Date("2026-11-04T12:00:00Z"), app: APP })).toContain("Rheobase from");
  });

  it("keeps the traces small enough for browser storage, with every spike's peak", () => {
    const json = serializeRuns([a.rec]);
    expect(json.length).toBeLessThan(150_000);
    const rheo = a.rec.traces.find((t) => t.isRheobase)!;
    expect(Math.max(...rheo.max)).toBeGreaterThan(30);
  });

  it("says what changed between runs", () => {
    expect(settingsDiff(a.rec.settings, b.rec.settings)).toEqual(["gL (nS): 28.95 → 20"]);
    expect(settingsDiff(a.rec.settings, a.rec.settings)).toEqual([]);
  });

  it("builds a self-contained report that fetches nothing and runs no code", () => {
    const html = buildReport([a.rec, b.rec], { title: "Leak and excitability", author: "A. Student", generatedAt: new Date("2026-10-18T12:00:00Z"), app: APP });
    expect(html).toContain("Leak and excitability");
    expect(html).toContain("Changed from run 1:</b> gL (nS)");
    expect(html).toContain("Pospischil");
    // user text is escaped, never interpreted
    expect(html).toContain("Less leak &lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>bold</b>");
    // nothing that loads or executes: the only script is the inert JSON data block
    expect(html).not.toMatch(/<(img|link|iframe|object|embed)\b/i);
    expect(html).not.toMatch(/\bsrc=|@import|url\(\s*["']?http/i);
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="application/json" id="gaba-excites-runs">']);
  });

  it("reads each threshold by its criterion, so a record made before 0.5 V/s was added keeps its columns", () => {
    const old = { ...a.rec, thresholds: a.rec.thresholds.filter((t) => t.vps !== 0.5), measures: { ...a.rec.measures, threshDvdt: undefined } };
    const html = buildReport([old], { title: "t", author: "", generatedAt: new Date(), app: APP });
    const table = html.slice(html.indexOf('<table class="m">'));
    const heads = [...table.slice(0, table.indexOf("</tr>")).matchAll(/<th>([^<]*)/g)].map((m) => m[1]);
    const row = table.slice(table.indexOf("</tr>") + 5);
    const cells = [...row.slice(0, row.indexOf("</tr>")).matchAll(/<td>([^<]*)/g)].map((m) => m[1]);
    const cell = (vps: number) => cells[heads.indexOf(`Threshold @${vps} V/s`)];
    for (const c of CRITERIA) {
      const t = old.thresholds.find((u) => u.vps === c.vps);
      if (!t) expect(cell(c.vps)).toBe("—");
      else if (!t.hitFloor) expect(cell(c.vps)).toBe(t.v.toFixed(1));
    }
    expect(a.rec.measures.threshDvdt).toBe(10);
  });

  it("loads its runs back from the report or the notebook file, NaN included", () => {
    const html = buildReport([a.rec, b.rec], { title: "t", author: "", generatedAt: new Date(), app: APP });
    for (const text of [html, serializeRuns([a.rec, b.rec])]) {
      const back = parseRuns(text);
      expect(back.map((x) => x.title)).toEqual([a.rec.title, b.rec.title]);
      expect(back[1].note).toBe(b.rec.note);
      expect(back[0].thresholds[3].v).toBe(a.rec.thresholds[3].v);
      expect(back[0].settings).toEqual(a.rec.settings);
    }
    const noSpike = { ...a.rec, measures: { ...a.rec.measures, rheobase: NaN } };
    expect(Number.isNaN(parseRuns(serializeRuns([noSpike]))[0].measures.rheobase)).toBe(true);
    expect(() => parseRuns("{}")).toThrow(/not a gaba_excites notebook/);
    expect(() => parseRuns("<html></html>")).toThrow(/not a gaba_excites report/);
  });
});
